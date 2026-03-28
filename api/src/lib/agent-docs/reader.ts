/**
 * Read/write agents.json from the output directory.
 */
import * as fs from "fs";
import * as path from "path";
import { AgentsJson, type AgentsJson as AgentsJsonType } from "./schema";

// --- Dependency injection ---

export type ReaderDependencies = {
  readFileSync: (filePath: string, encoding: BufferEncoding) => string;
  writeFileSync: (filePath: string, data: string, encoding: BufferEncoding) => void;
  existsSync: (filePath: string) => boolean;
  mkdirSync: (dirPath: string, options: { recursive: boolean }) => void;
  outputDir: string;
};

function resolveReaderDeps(overrides?: Partial<ReaderDependencies>): ReaderDependencies {
  return {
    readFileSync: overrides?.readFileSync ?? fs.readFileSync,
    writeFileSync: overrides?.writeFileSync ?? fs.writeFileSync,
    existsSync: overrides?.existsSync ?? fs.existsSync,
    mkdirSync: overrides?.mkdirSync ?? ((p, o) => fs.mkdirSync(p, o)),
    outputDir: overrides?.outputDir ?? (process.env.OUTPUT_DIR || "output"),
  };
}

// --- Public API ---

/**
 * Read and validate agents.json for a domain.
 * Returns null if file doesn't exist or validation fails.
 */
export function readAgentsJson(
  domain: string,
  deps?: Partial<ReaderDependencies>,
): AgentsJsonType | null {
  const d = resolveReaderDeps(deps);
  const filePath = path.join(d.outputDir, domain, "agents.json");
  if (!d.existsSync(filePath)) return null;

  try {
    const raw = d.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = AgentsJson.safeParse(parsed);
    if (result.success) return result.data;
    console.warn(`Invalid agents.json for ${domain}:`, result.error.issues);
    return null;
  } catch (err) {
    console.warn(`Failed to read agents.json for ${domain}:`, err);
    return null;
  }
}

/**
 * Validate and save agents.json for a domain.
 * Creates the output directory if it doesn't exist.
 * Throws if validation fails.
 */
export function saveAgentsJson(
  domain: string,
  data: AgentsJsonType,
  deps?: Partial<ReaderDependencies>,
): void {
  const d = resolveReaderDeps(deps);
  const result = AgentsJson.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Invalid agents.json: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }

  const filePath = path.join(d.outputDir, domain, "agents.json");
  const dir = path.dirname(filePath);
  if (!d.existsSync(dir)) {
    d.mkdirSync(dir, { recursive: true });
  }

  d.writeFileSync(filePath, JSON.stringify(result.data, null, 2), "utf-8");
}
