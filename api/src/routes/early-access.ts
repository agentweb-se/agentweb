import { Hono } from "hono";
import fs from "fs";
import path from "path";

const app = new Hono();

const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "..", "output");
const EARLY_ACCESS_FILE = path.join(OUTPUT_DIR, "early-access.jsonl");

// Rate limiting for admin endpoint: 5 attempts per IP, 10 minute lockout
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;

app.get("/", async (c) => {
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
  const now = Date.now();

  const record = failedAttempts.get(ip);
  if (record && record.lockedUntil > now) {
    const minutesLeft = Math.ceil((record.lockedUntil - now) / 60000);
    return c.json({ error: `Too many attempts. Try again in ${minutesLeft} minutes.` }, 429);
  }

  const adminCode = c.req.header("x-admin-code");
  if (!process.env.ADMIN_CODE || adminCode !== process.env.ADMIN_CODE) {
    const attempts = (record?.count || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      failedAttempts.set(ip, { count: attempts, lockedUntil: now + LOCKOUT_MS });
    } else {
      failedAttempts.set(ip, { count: attempts, lockedUntil: 0 });
    }
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Successful auth — clear failed attempts
  failedAttempts.delete(ip);

  if (!fs.existsSync(EARLY_ACCESS_FILE)) {
    return c.json({ entries: [] });
  }

  const lines = fs.readFileSync(EARLY_ACCESS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line)).reverse();
  return c.json({ entries });
});

// Rate limiting for POST: 3 submissions per IP per hour
const submitAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_SUBMITS = 3;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getExistingEmails(): Set<string> {
  if (!fs.existsSync(EARLY_ACCESS_FILE)) return new Set();
  const lines = fs.readFileSync(EARLY_ACCESS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  const emails = new Set<string>();
  for (const line of lines) {
    try { emails.add(JSON.parse(line).email); } catch { /* skip malformed */ }
  }
  return emails;
}

app.post("/", async (c) => {
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
  const now = Date.now();

  // Rate limit check
  const record = submitAttempts.get(ip);
  if (record && record.resetAt > now && record.count >= MAX_SUBMITS) {
    return c.json({ error: "Too many submissions. Try again later." }, 429);
  }
  if (record && record.resetAt <= now) {
    submitAttempts.delete(ip);
  }

  const body = await c.req.json().catch(() => null);

  if (!body) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { name, email, company, use_case } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }

  if (!email || typeof email !== "string" || !/\S+@\S+\.\S+/.test(email)) {
    return c.json({ error: "Valid email is required" }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Duplicate email check
  if (getExistingEmails().has(normalizedEmail)) {
    // Return success silently — don't reveal that the email exists
    return c.json({ ok: true });
  }

  const entry = {
    name: name.trim(),
    email: normalizedEmail,
    company: (company || "").trim(),
    use_case: (use_case || "other").trim(),
    timestamp: new Date().toISOString(),
  };

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Append to JSONL file
  fs.appendFileSync(EARLY_ACCESS_FILE, JSON.stringify(entry) + "\n");

  // Track submission count
  const current = submitAttempts.get(ip);
  submitAttempts.set(ip, {
    count: (current?.count || 0) + 1,
    resetAt: current?.resetAt || now + SUBMIT_WINDOW_MS,
  });

  return c.json({ ok: true });
});

export default app;
