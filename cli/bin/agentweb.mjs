#!/usr/bin/env node

import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO_URL = "https://github.com/agentweb-se/agentweb.git";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";

function log(msg) {
  console.log(`${CYAN}[agentweb]${RESET} ${msg}`);
}

function error(msg) {
  console.error(`${RED}[agentweb]${RESET} ${msg}`);
}

const API_KEY_VARS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"];

function findApiKey() {
  // Check environment variables first
  for (const key of API_KEY_VARS) {
    if (process.env[key]) return true;
  }

  // Check .env.local in current directory
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const key of API_KEY_VARS) {
      const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
      if (match && match[1] && !match[1].includes("xxxx")) return true;
    }
  }

  return false;
}

function isInProjectDir() {
  return existsSync(join(process.cwd(), "api", "package.json"))
    && existsSync(join(process.cwd(), "web", "package.json"));
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

function spawnService(name, cmd, args, cwd, env) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  child.on("error", (err) => error(`${name} failed to start: ${err.message}`));
  return child;
}

// --- Main ---

console.log(`
${BOLD}${CYAN}  ╔═══════════════════════════════════════╗
  ║          AgentWeb v0.2.0               ║
  ║   Turn websites into AI agent manuals  ║
  ╚═══════════════════════════════════════╝${RESET}
`);

// 1. Find API key
let hasKey = findApiKey();
if (!hasKey) {
  error(`No AI provider API key found.`);
  console.log(`
  You need at least one of these set as an environment variable or in ${BOLD}.env.local${RESET}:

    ${YELLOW}ANTHROPIC_API_KEY${RESET}    ${DIM}https://console.anthropic.com${RESET}
    ${YELLOW}OPENAI_API_KEY${RESET}       ${DIM}https://platform.openai.com${RESET}
    ${YELLOW}GEMINI_API_KEY${RESET}       ${DIM}https://aistudio.google.com${RESET}

  Example:
    ${YELLOW}export ANTHROPIC_API_KEY=sk-ant-...${RESET}
    ${DIM}or add it to .env.local in your project directory${RESET}
`);
  process.exit(1);
}

log(`API key found ${GREEN}OK${RESET}`);

// 2. Get project files
let projectDir = process.cwd();

if (!isInProjectDir()) {
  log(`Cloning AgentWeb into ${BOLD}./agentweb${RESET}...`);
  const targetDir = resolve(process.cwd(), "agentweb");

  if (existsSync(targetDir)) {
    log(`Directory ${BOLD}agentweb/${RESET} already exists, using it`);
  } else {
    run(`git clone --depth 1 ${REPO_URL}`, process.cwd());
  }
  projectDir = targetDir;
}

// 3. Write .env.local if it doesn't exist (pass through all available keys)
function writeEnvFile(path) {
  if (existsSync(path)) return false;
  const lines = API_KEY_VARS
    .filter((key) => process.env[key])
    .map((key) => `${key}=${process.env[key]}`);
  if (lines.length > 0) {
    writeFileSync(path, lines.join("\n") + "\n");
    return true;
  }
  return false;
}

if (writeEnvFile(join(projectDir, ".env.local"))) {
  log(`Created ${BOLD}.env.local${RESET}`);
}
writeEnvFile(join(projectDir, "api", ".env.local"));

// 4. Install dependencies
log(`Installing API dependencies... ${DIM}(includes Chromium download, may take a minute)${RESET}`);
run("npm install", join(projectDir, "api"));

log(`Installing frontend dependencies...`);
run("npm install", join(projectDir, "web"));

// 5. Start both services
log(`Starting AgentWeb...`);
console.log();

const apiProcess = spawnService(
  "API",
  "npx", ["tsx", "src/index.ts"],
  join(projectDir, "api"),
  {}
);

const webProcess = spawnService(
  "Web",
  "npx", ["next", "dev", "-p", "3000"],
  join(projectDir, "web"),
  { NEXT_PUBLIC_API_URL: "http://localhost:4001" }
);

// Wait a moment then show the URL
setTimeout(() => {
  console.log(`
${BOLD}${GREEN}  ✓ AgentWeb is running!${RESET}

    ${BOLD}Open:${RESET}  ${CYAN}http://localhost:3000${RESET}
    ${DIM}API:   http://localhost:4001${RESET}

    ${DIM}Press Ctrl+C to stop${RESET}
`);
}, 3000);

// Clean shutdown
function shutdown() {
  log("Shutting down...");
  apiProcess.kill();
  webProcess.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
