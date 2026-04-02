/**
 * Explorer Orchestrator — manifesto first, then all discovery agents in parallel.
 *
 * Phase 1: Manifesto Agent — understand the site, document identity + structure
 * Phase 2-6 (parallel): Search, Browse, Forms, Contact, Experience — each independent
 *
 * Each agent has its own prompt, assessment, retry loop, and browser session.
 * Shared state: doc (agents.json — different keys per agent), limits (metrics only).
 * The ONLY hard limit is wall time. Nothing else stops an agent.
 */
import * as fs from "fs";
import * as path from "path";
import type { Browser } from "puppeteer";
import { runAgentLoop } from "../agent/loop";
import type { AgentConfig, AgentDemoEvent } from "../agent/types";
import {
  MANIFESTO_TOOLS,
  EXPLORER_TOOLS,
  createExplorerToolExecutor,
  type ExplorerLimits,
} from "./tools";
import {
  buildManifestoPrompt,
  buildManifestoRetryPrompt,
  buildSearchPrompt,
  buildSearchRetryPrompt,
  buildBrowsePrompt,
  buildBrowseRetryPrompt,
  buildFormsPrompt,
  buildFormsRetryPrompt,
  buildContactPrompt,
  buildContactRetryPrompt,
  buildExperiencePrompt,
  buildExperienceRetryPrompt,
} from "./prompts";
import {
  AgentsJson,
  blankAgentsJsonTemplate,
  type AgentsJson as AgentsJsonType,
} from "./schema";
import { launchChrome, closeChrome } from "../crawl/chrome";
import { BrowserSession } from "./browser-tool";
import { getPhaseModel, getModelCost, getModelInfo, DEFAULT_MODEL } from "../agent/providers/models";
import {
  assessManifestoQuality,
  assessSearchQuality,
  assessBrowseQuality,
  assessFormsQuality,
  assessContactQuality,
  assessExperienceQuality,
  assignCapabilityPriorities,
  getCapabilityStatus,
  autoFillBehavior,
  MAX_PHASE_RETRIES,
} from "./assessments";

const MAX_VALIDATION_ATTEMPTS = 3;

// --- Dependency injection ---

export type ExplorerDependencies = {
  // Filesystem
  existsSync: (p: string) => boolean;
  mkdirSync: (p: string, options: { recursive: boolean }) => void;
  writeFileSync: (p: string, data: string, encoding: BufferEncoding) => void;
  createWriteStream: (p: string, options: { flags: string }) => fs.WriteStream;

  // Browser lifecycle
  launchChrome: typeof launchChrome;
  closeChrome: typeof closeChrome;
  createBrowserSession: (getBrowser: () => Promise<Browser>, domain: string, limits: ExplorerLimits) => BrowserSession;

  // Agent loop
  runAgentLoop: typeof runAgentLoop;

  // Config
  outputDir: string;
  maxWallTimeMs: number;
  maxExplorerTurns: number;

  // Clock
  now: () => number;
};

function parseExplorerMaxTurns(): number {
  const raw = process.env.EXPLORER_MAX_TURNS?.trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.warn(`[explorer] Ignoring invalid EXPLORER_MAX_TURNS=${raw}`);
    return Number.MAX_SAFE_INTEGER;
  }
  return parsed;
}

function resolveExplorerDeps(overrides?: Partial<ExplorerDependencies>): ExplorerDependencies {
  return {
    existsSync: overrides?.existsSync ?? fs.existsSync,
    mkdirSync: overrides?.mkdirSync ?? ((p, o) => fs.mkdirSync(p, o)),
    writeFileSync: overrides?.writeFileSync ?? fs.writeFileSync,
    createWriteStream: overrides?.createWriteStream ?? ((p, o) => fs.createWriteStream(p, o)),
    launchChrome: overrides?.launchChrome ?? launchChrome,
    closeChrome: overrides?.closeChrome ?? closeChrome,
    createBrowserSession: overrides?.createBrowserSession ?? ((gb, d, l) => new BrowserSession(gb, d, l)),
    runAgentLoop: overrides?.runAgentLoop ?? runAgentLoop,
    outputDir: overrides?.outputDir ?? (process.env.OUTPUT_DIR || "output"),
    maxWallTimeMs: overrides?.maxWallTimeMs ?? (15 * 60 * 1000),
    maxExplorerTurns: overrides?.maxExplorerTurns ?? parseExplorerMaxTurns(),
    now: overrides?.now ?? Date.now,
  };
}

type SendFn = (data: Record<string, unknown>) => void;

// --- Run Logger ---

type FsDeps = Pick<ExplorerDependencies, "existsSync" | "mkdirSync" | "createWriteStream" | "now">;

class RunLogger {
  private stream: fs.WriteStream;
  private step = 0;
  private closed = false;
  private nowFn: () => number;
  readonly path: string;

  constructor(logDir: string, fsDeps: FsDeps) {
    if (!fsDeps.existsSync(logDir)) fsDeps.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date(fsDeps.now()).toISOString().replace(/[:.]/g, "-");
    this.path = path.join(logDir, `explorer-${timestamp}.jsonl`);
    this.stream = fsDeps.createWriteStream(this.path, { flags: "a" });
    this.stream.on("error", () => {});
    this.nowFn = fsDeps.now;
  }

  /** Create a phase-scoped logger — all calls automatically tagged with this phase */
  forPhase(phase: string): PhaseLogger {
    return new PhaseLogger(this, phase);
  }

  logStep(phase: string, type: string, data: Record<string, unknown>) {
    this.step++;
    this.write({ type, step: this.step, phase, ...data });
  }

  logToolCall(phase: string, toolName: string, input: Record<string, unknown>) {
    this.step++;
    this.write({ type: "tool_call", step: this.step, phase, tool: toolName, input });
  }

  logToolResult(phase: string, toolName: string, output: string, durationMs: number) {
    this.write({
      type: "tool_result", step: this.step, phase,
      tool: toolName, output, output_length: output.length, duration_ms: durationMs,
    });
  }

  logAgentText(phase: string, text: string) {
    this.step++;
    this.write({ type: "agent_text", step: this.step, phase, text });
  }

  logAssessment(phase: string, name: string, passed: boolean, failures: string[]) {
    this.step++;
    this.write({ type: "assessment", step: this.step, phase, name, passed, failures });
  }

  logEvent(phase: string, data: Record<string, unknown>) {
    this.write({ ...data, phase });
  }

  close(summary: Record<string, unknown>) {
    this.step++;
    this.write({ type: "summary", step: this.step, ...summary });
    this.closed = true;
    this.stream.end();
  }

  private write(data: Record<string, unknown>) {
    if (this.closed) return;
    try {
      this.stream.write(JSON.stringify({ ...data, ts: this.nowFn() }) + "\n");
    } catch { /* ignore */ }
  }
}

/** Phase-scoped logger — wraps RunLogger with a fixed phase tag */
class PhaseLogger {
  constructor(private logger: RunLogger, private phase: string) {}

  setPhase(phase: string) { this.phase = phase; }
  getPhase() { return this.phase; }

  logStep(type: string, data: Record<string, unknown>) { this.logger.logStep(this.phase, type, data); }
  logToolCall(toolName: string, input: Record<string, unknown>) { this.logger.logToolCall(this.phase, toolName, input); }
  logToolResult(toolName: string, output: string, durationMs: number) { this.logger.logToolResult(this.phase, toolName, output, durationMs); }
  logAgentText(text: string) { this.logger.logAgentText(this.phase, text); }
  logAssessment(name: string, passed: boolean, failures: string[]) { this.logger.logAssessment(this.phase, name, passed, failures); }
  logEvent(data: Record<string, unknown>) { this.logger.logEvent(this.phase, data); }
}

// --- Token/Cost Tracking ---

interface TokenAccumulator {
  inputTokens: number;
  outputTokens: number;
}

/** Calculate cost using the average model cost across phases (approximation for mixed-model runs) */
function calculateCost(tokens: TokenAccumulator, modelId?: string): number {
  const cost = getModelCost(modelId || DEFAULT_MODEL);
  return tokens.inputTokens * (cost.inputPer1M / 1_000_000) + tokens.outputTokens * (cost.outputPer1M / 1_000_000);
}

// --- Event Handler Factory ---

function createEventHandler(phaseLogger: PhaseLogger, send: SendFn, tokens: TokenAccumulator) {
  return (event: AgentDemoEvent) => {
    const phase = phaseLogger.getPhase();
    if (event.type === "text" && event.content) {
      phaseLogger.logAgentText(event.content);
    } else if (event.type === "error" && event.content) {
      phaseLogger.logStep("agent_error", { error: event.content });
    } else if (event.type === "usage") {
      tokens.inputTokens += event.input_tokens || 0;
      tokens.outputTokens += event.output_tokens || 0;
      phaseLogger.logStep("usage", {
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        total_input: tokens.inputTokens,
        total_output: tokens.outputTokens,
        cost_so_far: `$${calculateCost(tokens).toFixed(4)}`,
      });
    } else if (event.type === "done") {
      phaseLogger.logStep("agent_done", {});
    }
    // Tag SSE events with phase so frontend can distinguish parallel agents
    send({ ...(event as unknown as Record<string, unknown>), phase });
  };
}

// --- Main Orchestrator ---

/** Per-phase model overrides — if set, takes priority over env vars */
export type PhaseModelOverrides = Partial<Record<string, string>>;

export async function startExplorer(
  url: string,
  send: SendFn,
  modelOverrides?: PhaseModelOverrides,
  deps?: Partial<ExplorerDependencies>,
): Promise<AgentsJsonType> {
  const d = resolveExplorerDeps(deps);
  // Helper: get model for a phase, preferring overrides → env vars → default
  const modelFor = (phase: string) => modelOverrides?.[phase] || getPhaseModel(phase);
  const doc = blankAgentsJsonTemplate();
  const domain = new URL(url).hostname.replace(/^www\./, "");
  doc.site.domain = domain;

  const limits: ExplorerLimits = {
    pagesFetched: 0,
    httpRequests: 0,
    browserActions: 0,
    discoveredExternalDomains: new Set(),
  };

  const startTime = d.now();
  const isWallTimeExceeded = () => d.now() - startTime > d.maxWallTimeMs;

  // Logger
  const logDir = path.join(d.outputDir, domain);
  const logger = new RunLogger(logDir, d);

  // Browser lifecycle
  let browser: Browser | null = null;
  const getBrowser = async (): Promise<Browser> => {
    if (browser && browser.connected) return browser;
    const result = await d.launchChrome();
    browser = result.browser;
    return browser;
  };

  const manifestoBrowserSession = d.createBrowserSession(getBrowser, domain, limits);

  // Token accumulator — tracks total usage across all phases
  const tokens: TokenAccumulator = { inputTokens: 0, outputTokens: 0 };

  // Scoped tool executor factory — each agent phase can only write its own sections
  function makeScopedExecutorForSession(bSession: BrowserSession, phaseLog: PhaseLogger, allowedSections?: string[]) {
    const rawExecutor = createExplorerToolExecutor(domain, doc, send, limits, bSession, allowedSections);
    return async (name: string, input: Record<string, unknown>): Promise<string> => {
      phaseLog.logToolCall(name, input);
      const callStart = d.now();
      const result = await rawExecutor(name, input);
      phaseLog.logToolResult(name, result, d.now() - callStart);
      return result;
    };
  }

  logger.logEvent("init", { type: "explorer:started", url, domain });
  send({ type: "explorer:started", url, domain });

  // =========================================================================
  // PHASE 1: MANIFESTO AGENT — understand the site (runs alone)
  // =========================================================================
  const manifestoLog = logger.forPhase("manifesto");
  const manifestoOnEvent = createEventHandler(manifestoLog, send, tokens);

  send({ type: "explorer:phase", phase: "manifesto", message: "Understanding the site..." });

  const manifestoExecutor = makeScopedExecutorForSession(manifestoBrowserSession, manifestoLog, ["site", "instructions.general", "presentation", "pages"]);
  const manifestoConfig: AgentConfig = {
    side: "explorer",
    model: modelFor("manifesto"),
    systemPrompt: buildManifestoPrompt(url),
    tools: MANIFESTO_TOOLS,
    executeTool: manifestoExecutor,
    maxTurns: d.maxExplorerTurns,
    onEvent: manifestoOnEvent,
  };

  try {
    await d.runAgentLoop(manifestoConfig, `Identify ${url}. Read the homepage and write the site identity.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    manifestoLog.logStep("manifesto_error", { error: msg });
    send({ type: "explorer:error", phase: "manifesto", error: msg });
  }

  // Manifesto assessment + retry
  let manifestoRetries = 0;
  while (!isWallTimeExceeded()) {
    const failures = assessManifestoQuality(doc);
    manifestoLog.logAssessment("manifesto_quality", failures.length === 0, failures);
    if (failures.length === 0) break;

    manifestoRetries++;
    if (manifestoRetries > MAX_PHASE_RETRIES) break;
    manifestoLog.setPhase(`manifesto-retry-${manifestoRetries}`);
    send({ type: "explorer:manifesto-retry", attempt: manifestoRetries, failures });

    try {
      await d.runAgentLoop(manifestoConfig, buildManifestoRetryPrompt(failures));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      manifestoLog.logStep("manifesto_retry_error", { error: msg });
    }
  }

  await manifestoBrowserSession.close();

  // =========================================================================
  // PHASES 2-5: SEARCH + BROWSE + FORMS + CONTACT — all in parallel
  // =========================================================================
  const siteInfo = {
    name: doc.site.name || domain,
    domain: doc.site.domain || domain,
    language: doc.site.language || "en",
    type: doc.site.type || "website",
  };

  // Each agent gets its own browser session + phase logger
  const searchBrowserSession = d.createBrowserSession(getBrowser, domain, limits);
  const browseBrowserSession = d.createBrowserSession(getBrowser, domain, limits);
  const formsBrowserSession = d.createBrowserSession(getBrowser, domain, limits);
  const contactBrowserSession = d.createBrowserSession(getBrowser, domain, limits);
  const experienceBrowserSession = d.createBrowserSession(getBrowser, domain, limits);

  // --- Search Phase Runner ---
  async function runSearchPhase(): Promise<{ status: "verified" | "not_found" | "found" | "missing"; retries: number }> {
    const log = logger.forPhase("search");
    const onEvent = createEventHandler(log, send, tokens);
    send({ type: "explorer:phase", phase: "search", message: "Discovering search API..." });

    const searchExecutor = makeScopedExecutorForSession(searchBrowserSession, log, ["capabilities.search", "instructions.search"]);
    const searchConfig: AgentConfig = {
      side: "explorer",
      model: modelFor("search"),
      systemPrompt: buildSearchPrompt(url, siteInfo),
      tools: EXPLORER_TOOLS,
      executeTool: searchExecutor,
      maxTurns: d.maxExplorerTurns,
      onEvent,
    };

    try {
      await d.runAgentLoop(searchConfig, `Find and verify the search API for ${siteInfo.name} (${url}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.logStep("search_error", { error: msg });
      send({ type: "explorer:error", phase: "search", error: msg });
    }

    let searchRetries = 0;
    while (!isWallTimeExceeded()) {
      const failures = assessSearchQuality(doc);
      log.logAssessment("search_quality", failures.length === 0, failures);
      if (failures.length === 0) break;

      searchRetries++;
      if (searchRetries > MAX_PHASE_RETRIES) break;
      log.setPhase(`search-retry-${searchRetries}`);
      log.logStep("search_retry_start", { attempt: searchRetries, failures });
      send({ type: "explorer:search-retry", attempt: searchRetries, failures });

      try {
        await d.runAgentLoop(
          searchConfig,
          buildSearchRetryPrompt(failures, {
            search_cap: doc.capabilities?.search,
            search_inst: doc.instructions?.search,
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.logStep("search_retry_error", { error: msg });
        send({ type: "explorer:error", phase: "search", error: msg });
      }
    }

    await searchBrowserSession.close();
    return { status: getCapabilityStatus(doc, "search"), retries: searchRetries };
  }

  // --- Browse Phase Runner ---
  async function runBrowsePhase(): Promise<{ verified: boolean; retries: number }> {
    const log = logger.forPhase("browse");
    const onEvent = createEventHandler(log, send, tokens);
    send({ type: "explorer:phase", phase: "browse", message: "Mapping navigation & categories..." });

    const browseExecutor = makeScopedExecutorForSession(browseBrowserSession, log, ["capabilities.navigation", "instructions.browse"]);
    const browseConfig: AgentConfig = {
      side: "explorer",
      model: modelFor("browse"),
      systemPrompt: buildBrowsePrompt(url, siteInfo, false),
      tools: EXPLORER_TOOLS,
      executeTool: browseExecutor,
      maxTurns: d.maxExplorerTurns,
      onEvent,
    };

    try {
      await d.runAgentLoop(browseConfig, `Map the navigation structure and categories for ${siteInfo.name} (${url}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.logStep("browse_error", { error: msg });
      send({ type: "explorer:error", phase: "browse", error: msg });
    }

    let browseRetries = 0;
    while (!isWallTimeExceeded()) {
      const failures = assessBrowseQuality(doc, domain);
      log.logAssessment("browse_quality", failures.length === 0, failures);
      if (failures.length === 0) break;

      browseRetries++;
      if (browseRetries > MAX_PHASE_RETRIES) break;
      log.setPhase(`browse-retry-${browseRetries}`);
      log.logStep("browse_retry_start", { attempt: browseRetries, failures });
      send({ type: "explorer:browse-retry", attempt: browseRetries, failures });

      try {
        await d.runAgentLoop(
          browseConfig,
          buildBrowseRetryPrompt(failures, {
            nav_cap: doc.capabilities?.navigation,
            browse_inst: doc.instructions?.browse,
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.logStep("browse_retry_error", { error: msg });
        send({ type: "explorer:error", phase: "browse", error: msg });
      }
    }

    await browseBrowserSession.close();
    return { verified: assessBrowseQuality(doc, domain).length === 0, retries: browseRetries };
  }

  // --- Forms Phase Runner ---
  async function runFormsPhase(): Promise<{ status: "verified" | "not_found" | "found" | "missing"; retries: number }> {
    const log = logger.forPhase("forms");
    const onEvent = createEventHandler(log, send, tokens);
    send({ type: "explorer:phase", phase: "forms", message: "Discovering filters & sorting..." });

    // No context from search/browse since we're parallel — forms discovers from homepage
    const formsContext = { searchEndpoint: null, categoryUrls: [] as string[] };

    const formsExecutor = makeScopedExecutorForSession(formsBrowserSession, log, ["capabilities.forms", "instructions.forms"]);
    const formsConfig: AgentConfig = {
      side: "explorer",
      model: modelFor("forms"),
      systemPrompt: buildFormsPrompt(url, siteInfo, formsContext),
      tools: EXPLORER_TOOLS,
      executeTool: formsExecutor,
      maxTurns: d.maxExplorerTurns,
      onEvent,
    };

    try {
      await d.runAgentLoop(formsConfig, `Discover filters and sorting for ${siteInfo.name} (${url}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.logStep("forms_error", { error: msg });
      send({ type: "explorer:error", phase: "forms", error: msg });
    }

    let formsRetries = 0;
    while (!isWallTimeExceeded()) {
      const failures = assessFormsQuality(doc);
      log.logAssessment("forms_quality", failures.length === 0, failures);
      if (failures.length === 0) break;

      formsRetries++;
      if (formsRetries > MAX_PHASE_RETRIES) break;
      log.setPhase(`forms-retry-${formsRetries}`);
      log.logStep("forms_retry_start", { attempt: formsRetries, failures });
      send({ type: "explorer:forms-retry", attempt: formsRetries, failures });

      try {
        await d.runAgentLoop(
          formsConfig,
          buildFormsRetryPrompt(failures, {
            forms_cap: doc.capabilities?.forms,
            forms_inst: doc.instructions?.forms,
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.logStep("forms_retry_error", { error: msg });
        send({ type: "explorer:error", phase: "forms", error: msg });
      }
    }

    await formsBrowserSession.close();
    return { status: getCapabilityStatus(doc, "forms"), retries: formsRetries };
  }

  // --- Contact Phase Runner ---
  async function runContactPhase(): Promise<{ verified: boolean; retries: number }> {
    const log = logger.forPhase("contact");
    const onEvent = createEventHandler(log, send, tokens);
    send({ type: "explorer:phase", phase: "contact", message: "Finding contact information..." });

    const contactExecutor = makeScopedExecutorForSession(contactBrowserSession, log, ["instructions.contact", "instructions.policies"]);
    const contactConfig: AgentConfig = {
      side: "explorer",
      model: modelFor("contact"),
      systemPrompt: buildContactPrompt(url, siteInfo),
      tools: EXPLORER_TOOLS,
      executeTool: contactExecutor,
      maxTurns: d.maxExplorerTurns,
      onEvent,
    };

    try {
      await d.runAgentLoop(contactConfig, `Find contact information and site policies for ${siteInfo.name} (${url}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.logStep("contact_error", { error: msg });
      send({ type: "explorer:error", phase: "contact", error: msg });
    }

    let contactRetries = 0;
    while (!isWallTimeExceeded()) {
      const failures = assessContactQuality(doc);
      log.logAssessment("contact_quality", failures.length === 0, failures);
      if (failures.length === 0) break;

      contactRetries++;
      if (contactRetries > MAX_PHASE_RETRIES) break;
      log.setPhase(`contact-retry-${contactRetries}`);
      log.logStep("contact_retry_start", { attempt: contactRetries, failures });
      send({ type: "explorer:contact-retry", attempt: contactRetries, failures });

      try {
        await d.runAgentLoop(
          contactConfig,
          buildContactRetryPrompt(failures, {
            contact_inst: doc.instructions?.contact,
            policies_inst: (doc.instructions as Record<string, unknown>)?.policies,
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.logStep("contact_retry_error", { error: msg });
        send({ type: "explorer:error", phase: "contact", error: msg });
      }
    }

    await contactBrowserSession.close();
    return { verified: assessContactQuality(doc).length === 0, retries: contactRetries };
  }

  // --- Experience Phase Runner ---
  async function runExperiencePhase(): Promise<{ verified: boolean; retries: number }> {
    const log = logger.forPhase("experience");
    const onEvent = createEventHandler(log, send, tokens);
    send({ type: "explorer:phase", phase: "experience", message: "Analyzing brand voice & product display..." });

    const experienceExecutor = makeScopedExecutorForSession(experienceBrowserSession, log, ["presentation.voice", "presentation.product_display", "presentation.response_style"]);
    const experienceConfig: AgentConfig = {
      side: "explorer",
      model: modelFor("experience"),
      systemPrompt: buildExperiencePrompt(url, siteInfo),
      tools: EXPLORER_TOOLS,
      executeTool: experienceExecutor,
      maxTurns: d.maxExplorerTurns,
      onEvent,
    };

    try {
      await d.runAgentLoop(experienceConfig, `Analyze the brand voice, product images, and presentation style for ${siteInfo.name} (${url}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.logStep("experience_error", { error: msg });
      send({ type: "explorer:error", phase: "experience", error: msg });
    }

    let experienceRetries = 0;
    while (!isWallTimeExceeded()) {
      const failures = assessExperienceQuality(doc);
      log.logAssessment("experience_quality", failures.length === 0, failures);
      if (failures.length === 0) break;

      experienceRetries++;
      if (experienceRetries > MAX_PHASE_RETRIES) break;
      log.setPhase(`experience-retry-${experienceRetries}`);
      log.logStep("experience_retry_start", { attempt: experienceRetries, failures });
      send({ type: "explorer:experience-retry", attempt: experienceRetries, failures });

      try {
        await d.runAgentLoop(
          experienceConfig,
          buildExperienceRetryPrompt(failures, {
            voice: (doc.presentation as Record<string, unknown>)?.voice,
            product_display: (doc.presentation as Record<string, unknown>)?.product_display,
            response_style: (doc.presentation as Record<string, unknown>)?.response_style,
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.logStep("experience_retry_error", { error: msg });
        send({ type: "explorer:error", phase: "experience", error: msg });
      }
    }

    await experienceBrowserSession.close();
    return { verified: assessExperienceQuality(doc).length === 0, retries: experienceRetries };
  }

  // Run all 5 discovery agents in parallel
  const [searchResult, browseResult, formsResult, contactResult, experienceResult] = await Promise.all([
    runSearchPhase(),
    runBrowsePhase(),
    runFormsPhase(),
    runContactPhase(),
    runExperiencePhase(),
  ]);

  const searchRetries = searchResult.retries;
  const browseRetries = browseResult.retries;
  const formsRetries = formsResult.retries;
  const contactRetries = contactResult.retries;
  const experienceRetries = experienceResult.retries;

  console.log(`[explorer] All phases complete. search=${searchResult.status} browse=${browseResult.verified} forms=${formsResult.status} contact=${contactResult.verified} experience=${experienceResult.verified}`);

  // Post-parallel fixup: if search verified AND browse has when_to_use without search mention, add it
  if (searchResult.status === "verified" && browseResult.verified) {
    const browseInst = doc.instructions?.browse as { when_to_use?: string } | undefined;
    if (browseInst?.when_to_use && !browseInst.when_to_use.toLowerCase().includes("search")) {
      browseInst.when_to_use += " For specific queries, use search instead.";
    }
  }

  // Post-parallel: assign capability priorities
  assignCapabilityPriorities(doc, searchResult.status === "verified", browseResult.verified, formsResult.status === "verified");

  // =========================================================================
  // CLEANUP + VALIDATION
  // =========================================================================
  console.log("[explorer] Closing browser...");
  if (browser) {
    try { await d.closeChrome(browser); } catch (err) {
      console.error("[explorer] Error closing browser:", err);
    }
  }

  // Force-set metadata
  doc.version = "1.0";
  doc.generator = "agentweb.io";
  doc.generated_at = new Date(d.now()).toISOString();
  doc.pages.total_explored = limits.pagesFetched;

  // Auto-fill pages if manifesto didn't write them
  if (!doc.pages.key_pages || doc.pages.key_pages.length === 0) {
    doc.pages.key_pages = [{ url, description: "Homepage" }];
    doc.pages.page_types = { homepage: "Main landing page" };
  }

  // Auto-fill presentation if missing
  if (!doc.presentation || !(doc.presentation as { rules?: unknown[] }).rules?.length) {
    (doc as Record<string, unknown>).presentation = {
      rules: ["Link to source pages when referencing content"],
      language_note: doc.site.language ? `Content is in ${doc.site.language}` : undefined,
    };
  }

  // Auto-fill behavioral instructions (Origin/Referer, priorities, etc.)
  autoFillBehavior(doc);

  // Auto-fill capabilities the agents didn't write
  const allCaps = ["navigation", "search", "forms", "content_pages"] as const;
  for (const key of allCaps) {
    const existing = (doc.capabilities as Record<string, unknown>)[key] as
      | { status?: string }
      | undefined;
    if (!existing || !existing.status) {
      (doc.capabilities as Record<string, unknown>)[key] = { status: "not_found" };
    }
  }

  // Schema validation — unscoped executor so it can fix any section
  console.log("[explorer] Starting schema validation...");
  let validated = doc;
  try {
    const validationBrowserSession = d.createBrowserSession(getBrowser, domain, limits);
    const validationLog = logger.forPhase("validation");
    const validationOnEvent = createEventHandler(validationLog, send, tokens);
    const validationExecutor = makeScopedExecutorForSession(validationBrowserSession, validationLog);
    const validationConfig: AgentConfig = {
      side: "explorer",
      model: modelFor("validation"),
      systemPrompt: "You are a validation fix agent. Fix the issues described below.",
      tools: EXPLORER_TOOLS,
      executeTool: validationExecutor,
      maxTurns: d.maxExplorerTurns,
      onEvent: validationOnEvent,
    };
    validated = await validateAndFix(doc, validationConfig, send, logger, d.runAgentLoop);
    await validationBrowserSession.close();
    console.log("[explorer] Validation complete.");
  } catch (err) {
    console.error("[explorer] Validation failed:", err);
    // Continue with unvalidated doc — still save what we have
    validated = doc;
  }

  // Log final document
  console.log("[explorer] Preparing final document...");
  logger.logStep("complete", "final_document", { document: validated });

  // Cost calculation
  const totalCost = calculateCost(tokens);
  const costSummary = {
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
    total_tokens: tokens.inputTokens + tokens.outputTokens,
    cost_usd: Math.round(totalCost * 10000) / 10000, // 4 decimal places
    cost_display: `$${totalCost.toFixed(4)}`,
  };

  // Summary
  const searchStatus = getCapabilityStatus(doc, "search");
  const searchVerified = searchStatus === "verified";
  const browsePass = assessBrowseQuality(doc, domain).length === 0;
  const formsStatus = getCapabilityStatus(doc, "forms");
  const formsVerified = formsStatus === "verified";
  const contactPass = assessContactQuality(doc).length === 0;
  const experiencePass = assessExperienceQuality(doc).length === 0;
  const manifestoPass = assessManifestoQuality(doc).length === 0;
  const wallTimeMs = d.now() - startTime;

  // Generate demo questions based on the actual agents.json
  let suggestedQuestions: string[] = [];
  try {
    suggestedQuestions = await generateDemoQuestions(validated, modelFor("manifesto"));
    console.log(`[explorer] Generated ${suggestedQuestions.length} demo questions`);
  } catch (err) {
    console.error("[explorer] Failed to generate demo questions:", err);
  }

  // Save explorer-meta.json
  const explorerMeta = {
    cost_usd: costSummary.cost_usd,
    input_tokens: costSummary.input_tokens,
    output_tokens: costSummary.output_tokens,
    total_tokens: costSummary.total_tokens,
    wall_time_ms: wallTimeMs,
    phases: {
      manifesto: { verified: manifestoPass, retries: manifestoRetries },
      search: { verified: searchVerified, status: searchStatus, retries: searchRetries },
      browse: { verified: browsePass, retries: browseRetries },
      forms: { verified: formsVerified, status: formsStatus, retries: formsRetries },
      contact: { verified: contactPass, retries: contactRetries },
      experience: { verified: experiencePass, retries: experienceRetries },
    },
    suggested_questions: suggestedQuestions,
    generated_at: new Date(d.now()).toISOString(),
  };
  try {
    const metaDir = path.join(d.outputDir, domain);
    if (!d.existsSync(metaDir)) d.mkdirSync(metaDir, { recursive: true });
    d.writeFileSync(path.join(metaDir, "explorer-meta.json"), JSON.stringify(explorerMeta, null, 2), "utf-8");
    console.log(`[explorer] Saved explorer-meta.json for ${domain}`);
  } catch (err) {
    console.error("[explorer] Failed to save explorer-meta.json:", err);
  }

  logger.close({
    manifestoVerified: manifestoPass,
    manifestoRetries,
    searchVerified,
    searchStatus,
    searchRetries,
    browseVerified: browsePass,
    browseRetries,
    formsVerified,
    formsStatus,
    formsRetries,
    contactVerified: contactPass,
    contactRetries,
    experienceVerified: experiencePass,
    experienceRetries,
    pagesFetched: limits.pagesFetched,
    browserActions: limits.browserActions,
    httpRequests: limits.httpRequests,
    discoveredExternalDomains: [...limits.discoveredExternalDomains],
    wallTimeMs,
    ...costSummary,
  });

  send({
    type: "explorer:complete",
    domain,
    pagesExplored: limits.pagesFetched,
    browserActions: limits.browserActions,
    httpRequests: limits.httpRequests,
    manifestoVerified: manifestoPass,
    searchVerified,
    searchStatus,
    browseVerified: browsePass,
    formsVerified,
    formsStatus,
    contactVerified: contactPass,
    experienceVerified: experiencePass,
    wallTimeMs,
    logFile: logger.path,
    ...costSummary,
  });

  return validated;
}

// --- Demo Question Generation ---

/**
 * Generate 4 demo questions tailored to the agents.json content.
 * These should be specific, real-world questions that showcase the
 * advantage of having agents.json — the kind of questions where
 * knowing the right API endpoints and site structure actually matters.
 */
async function generateDemoQuestions(doc: AgentsJsonType, modelId: string): Promise<string[]> {
  const info = getModelInfo(modelId);
  if (!info) return [];

  const prompt = `You are given an agents.json document — a complete operating manual for the website ${doc.site.domain}.

Your job: write exactly 4 demo questions that a real person would ask an AI assistant about this site. These questions will be shown as suggestions in a side-by-side demo comparing an AI with vs. without agents.json.

Rules:
- Questions must be SPECIFIC and ACTIONABLE — things that require actually finding real data on the site (products, prices, policies, contact info, availability, etc.)
- Think about what a real user would ask their AI assistant: "find me X under $Y", "do they ship to Z", "what's the cheapest option for...", "get me a link to..."
- The questions should be ones where having agents.json gives a clear advantage — knowing the right search API, filters, categories, or endpoints actually helps
- Make them sound natural, like someone typing into ChatGPT — not formal, not robotic
- Each question should be 5-15 words, no more
- Base them on what the site ACTUALLY offers based on the agents.json — don't ask about things the site doesn't have
- NO generic questions like "what does this site do" or "what products do they sell" — be specific

The agents.json:
${JSON.stringify(doc, null, 2)}

Return ONLY a JSON array of 4 strings, nothing else. Example format:
["question 1", "question 2", "question 3", "question 4"]`;

  try {
    if (info.provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();
      const resp = await client.messages.create({
        model: modelId,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });
      const text = resp.content[0]?.type === "text" ? resp.content[0].text : "";
      return JSON.parse(text);
    } else {
      const { default: OpenAI } = await import("openai");
      const client = info.provider === "gemini"
        ? new OpenAI({ apiKey: process.env.GEMINI_API_KEY || "", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" })
        : new OpenAI();
      const usesNewTokenParam = /^(gpt-5|o[34])/.test(modelId);
      const tokenParam = usesNewTokenParam
        ? { max_completion_tokens: 300 }
        : { max_tokens: 300 };
      const resp = await client.chat.completions.create({
        model: modelId,
        ...tokenParam,
        messages: [{ role: "user", content: prompt }],
      } as Parameters<typeof client.chat.completions.create>[0]);
      const text = resp.choices[0]?.message?.content || "";
      return JSON.parse(text);
    }
  } catch (err) {
    console.error("[explorer] Demo question generation failed:", err);
    return [];
  }
}

// Assessment functions and priority assignment are in ./assessments.ts

// --- Schema Validation ---

async function validateAndFix(
  doc: AgentsJsonType,
  config: AgentConfig,
  send: SendFn,
  logger: RunLogger,
  agentLoop: (config: AgentConfig, question: string) => Promise<void>,
): Promise<AgentsJsonType> {
  const log = logger.forPhase("validation");
  for (let attempt = 0; attempt < MAX_VALIDATION_ATTEMPTS; attempt++) {
    const result = AgentsJson.safeParse(doc);
    if (result.success) {
      log.logStep("validation_passed", {});
      send({ type: "explorer:validated" });
      return result.data;
    }

    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );

    log.logStep("validation_failed", { attempt: attempt + 1, errors });
    send({ type: "explorer:validation-error", attempt: attempt + 1, errors });

    if (attempt < MAX_VALIDATION_ATTEMPTS - 1) {
      log.setPhase(`validation-fix-${attempt + 1}`);
      send({ type: "explorer:fixing", attempt: attempt + 1 });

      try {
        await agentLoop(
          { ...config, maxTurns: 10 },
          `Fix these validation errors by calling write_section:\n\n${errors.join("\n")}\n\nCurrent doc:\n${JSON.stringify(doc, null, 2)}`,
        );
      } catch {
        // continue to next attempt
      }
    }
  }

  send({ type: "explorer:validation-warning", message: "Saved with validation warnings" });

  // Fill any missing capabilities
  const allCaps2 = ["navigation", "search", "forms", "content_pages"] as const;
  for (const key of allCaps2) {
    if (!doc.capabilities[key]) {
      (doc.capabilities as Record<string, unknown>)[key] = { status: "not_found" };
    }
  }
  // Remove legacy capability keys that no longer have agents
  for (const key of ["listings", "downloads", "auth", "location", "media_feeds", "scheduling"]) {
    delete (doc.capabilities as Record<string, unknown>)[key];
  }

  return doc;
}
