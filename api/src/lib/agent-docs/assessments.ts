/**
 * Assessment functions for the explorer pipeline.
 *
 * Each assessment takes a doc (agents.json) and returns an array of failure messages.
 * Empty array = pass. These are the quality gates that decide whether an agent's
 * output is good enough or needs a retry.
 *
 * Extracted from explorer.ts for testability — these are pure functions with zero I/O.
 */
import type { AgentsJson as AgentsJsonType } from "./schema";

/** Minimum number of retry attempts each phase gets after a failed assessment */
export const MAX_PHASE_RETRIES = 3;

// --- Manifesto Quality Assessment ---

export function assessManifestoQuality(doc: AgentsJsonType): string[] {
  const failures: string[] = [];
  const s = doc.site;

  if (!s.name || s.name === "Unknown")
    failures.push('site.name is missing.');
  if (!s.language)
    failures.push('site.language is missing (e.g. "sv", "en").');
  if (!s.type)
    failures.push('site.type is missing (e.g. "e-commerce", "news").');
  if (!s.description || s.description.length < 20)
    failures.push('site.description is missing or too short.');

  return failures;
}

// --- Search Quality Assessment ---

export function assessSearchQuality(doc: AgentsJsonType): string[] {
  const failures: string[] = [];

  const searchCap = doc.capabilities?.search as { status?: string; details?: string } | undefined;
  if (!searchCap || !searchCap.status || (searchCap.status !== "verified" && searchCap.status !== "not_found")) {
    const current = searchCap?.status || "missing";
    failures.push(
      `capabilities.search.status is "${current}" — must be "verified" or "not_found".`
    );
    return failures;
  }

  if (searchCap.status === "not_found") {
    const details = searchCap.details || "";
    if (details.length < 20) {
      failures.push(
        `capabilities.search is "not_found" but details is too short (${details.length} chars). Explain why no usable site search exists (20+ chars required).`
      );
    }
    return failures;
  }

  const searchInst = doc.instructions?.search as { how?: string; response_format?: string; fallback?: string } | undefined;
  if (!searchInst) {
    failures.push(
      'instructions.search is missing. Use write_section("instructions.search", {how, tips, response_format}).'
    );
  } else {
    const how = searchInst.how || "";
    if (!how.includes("http://") && !how.includes("https://")) {
      failures.push(
        `instructions.search.how has no URL. Current: "${how.slice(0, 200)}". Must contain the actual API URL or search page URL.`
      );
    }

    const format = (searchInst.response_format || "").toLowerCase();
    const howLower = how.toLowerCase();
    const isHtml = format.includes("html") || howLower.includes("html");

    if (isHtml) {
      // HTML search is accepted as a fallback — but ONLY if the agent tried to find a JSON API first
      // and documented what it tried in the fallback field
      const fallback = (searchInst.fallback || "").toLowerCase();
      const details = (searchCap.details || "").toLowerCase();
      const triedJson = details.includes("api") || details.includes("json") || details.includes("algolia")
        || details.includes("elasticsearch") || details.includes("blocked") || details.includes("bot")
        || fallback.includes("api") || fallback.includes("json");

      if (!triedJson) {
        failures.push(
          'Search documents an HTML page but there is no evidence you tried to find the JSON API first. ' +
          'Most sites have a JSON API (Algolia, Elasticsearch, etc.) behind the HTML page. ' +
          'Use browser_action to type a search query, then check api_calls in content(). ' +
          'If the JSON API is genuinely blocked or unavailable, explain what you tried in capabilities.search.details ' +
          'and document the HTML search URL as the verified method.'
        );
      }
    }
  }

  return failures;
}

// --- Browse Quality Assessment ---

export function assessBrowseQuality(doc: AgentsJsonType, targetDomain: string): string[] {
  const failures: string[] = [];

  const navCap = doc.capabilities?.navigation as { status?: string; details?: string } | undefined;
  if (!navCap || !navCap.status || (navCap.status !== "verified" && navCap.status !== "not_found")) {
    const current = navCap?.status || "missing";
    failures.push(
      `capabilities.navigation.status is "${current}" — must be "verified" or "not_found".`
    );
    return failures; // Can't check further without a valid status
  }

  if (navCap.status === "not_found") {
    const details = navCap.details || "";
    if (details.length < 20) {
      failures.push(
        `capabilities.navigation is "not_found" but details is too short (${details.length} chars). Explain why navigation wasn't found (20+ chars required).`
      );
    }
    return failures;
  }

  // Status is "verified" — check instructions.browse
  const browseInst = doc.instructions?.browse as {
    how?: string;
    when_to_use?: string;
    categories?: Array<{ name?: string; url?: string; contains?: string }>;
  } | undefined;

  if (!browseInst) {
    failures.push(
      'instructions.browse is missing. Use write_section("instructions.browse", {how, when_to_use, categories, tips}).'
    );
    return failures;
  }

  if (!browseInst.how || browseInst.how.length === 0) {
    failures.push('instructions.browse.how is empty. Describe how to navigate the site.');
  }

  if (!browseInst.when_to_use || browseInst.when_to_use.length === 0) {
    failures.push('instructions.browse.when_to_use is empty. Describe when an agent should use browsing.');
  }

  const cats = browseInst.categories || [];
  if (cats.length < 3) {
    failures.push(
      `instructions.browse.categories has ${cats.length} entries — need at least 3. Visit more category pages.`
    );
  }

  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    if (!cat.name) failures.push(`Category ${i}: missing name.`);
    if (!cat.url) {
      failures.push(`Category ${i} ("${cat.name || "?"}"): missing url.`);
    } else {
      if (!cat.url.startsWith("http://") && !cat.url.startsWith("https://")) {
        failures.push(`Category ${i} ("${cat.name || "?"}"): url must start with http:// or https://. Got: "${cat.url.slice(0, 100)}"`);
      } else {
        try {
          const catHost = new URL(cat.url).hostname;
          if (!catHost.endsWith(targetDomain) && catHost !== targetDomain) {
            failures.push(`Category ${i} ("${cat.name || "?"}"): url is on ${catHost}, must be on ${targetDomain}.`);
          }
        } catch {
          failures.push(`Category ${i} ("${cat.name || "?"}"): invalid url "${cat.url.slice(0, 100)}".`);
        }
      }
    }
    if (!cat.contains) failures.push(`Category ${i} ("${cat.name || "?"}"): missing contains description.`);
  }

  return failures;
}

// --- Forms Quality Assessment ---

export const UNSAFE_FORM_PATTERNS = [
  "/contact", "/kontakt", "/register", "/signup", "/checkout",
  "/login", "/subscribe", "/order", "/cart", "/payment",
  "/account", "/auth",
];

export function assessFormsQuality(doc: AgentsJsonType): string[] {
  const failures: string[] = [];

  const formsCap = doc.capabilities?.forms as { status?: string; details?: string } | undefined;
  if (!formsCap || !formsCap.status || (formsCap.status !== "verified" && formsCap.status !== "not_found")) {
    const current = formsCap?.status || "missing";
    failures.push(
      `capabilities.forms.status is "${current}" — must be "verified" or "not_found".`
    );
    return failures;
  }

  if (formsCap.status === "not_found") {
    const details = formsCap.details || "";
    if (details.length < 20) {
      failures.push(
        `capabilities.forms is "not_found" but details is too short (${details.length} chars). Explain why no filters were found (20+ chars required).`
      );
    }
    return failures;
  }

  // Status is "verified" — check instructions.forms
  const formsInst = doc.instructions?.forms as {
    how?: string;
    filters?: Array<{ name?: string; param?: string; type?: string }>;
    endpoint?: { url?: string; method?: string };
  } | undefined;

  if (!formsInst) {
    failures.push(
      'instructions.forms is missing. Use write_section("instructions.forms", {how, filters, tips}).'
    );
    return failures;
  }

  if (!formsInst.how || formsInst.how.length === 0) {
    failures.push('instructions.forms.how is empty. Describe how to use filters.');
  }

  const filters = formsInst.filters || [];
  if (filters.length < 2) {
    failures.push(
      `instructions.forms.filters has ${filters.length} entries — need at least 2. Discover more filter params.`
    );
  }

  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    if (!f.name) failures.push(`Filter ${i}: missing name.`);
    if (!f.param) failures.push(`Filter ${i} ("${f.name || "?"}"): missing param.`);
  }

  // Reject HTML-only endpoints
  const howLower = (formsInst.how || "").toLowerCase();
  if (howLower.includes("html") && !howLower.includes("json")) {
    failures.push(
      'instructions.forms.how references HTML — filters must work via JSON API, not HTML pages.'
    );
  }

  // Safety check: reject endpoints that create/modify data
  const endpointUrl = (formsInst.endpoint?.url || "").toLowerCase();
  const howUrl = (formsInst.how || "").toLowerCase();
  for (const pattern of UNSAFE_FORM_PATTERNS) {
    if (endpointUrl.includes(pattern) || howUrl.includes(pattern)) {
      failures.push(
        `SAFETY: endpoint contains "${pattern}" — this looks like a data-creating form, not a read-only filter. ` +
        `The forms agent ONLY documents filters/sorting on listing pages. Remove this and look for filters on search/category pages instead.`
      );
      break;
    }
  }

  return failures;
}

// --- Contact Quality Assessment ---

export function assessContactQuality(doc: AgentsJsonType): string[] {
  const failures: string[] = [];

  const contactInst = doc.instructions?.contact as {
    how?: string;
    methods?: string[];
  } | undefined;

  if (!contactInst) {
    failures.push(
      'instructions.contact is missing. Use write_section("instructions.contact", {how, methods}).'
    );
    return failures;
  }

  if (!contactInst.how || contactInst.how.length === 0) {
    failures.push('instructions.contact.how is empty. Describe how to contact the site.');
  }

  const methods = contactInst.methods || [];
  if (methods.length === 0) {
    failures.push(
      'instructions.contact.methods is empty — need at least 1 contact method with real data.'
    );
    return failures;
  }

  // Check that at least one method has real contact data (phone, email, or URL)
  const phonePattern = /\+?\d[\d\s\-()]{6,}/;
  const emailPattern = /\S+@\S+\.\S+/;
  const urlPattern = /https?:\/\//;

  let hasRealData = false;
  for (const method of methods) {
    if (phonePattern.test(method) || emailPattern.test(method) || urlPattern.test(method)) {
      hasRealData = true;
      break;
    }
  }

  if (!hasRealData) {
    failures.push(
      'No contact method contains real data (phone number, email address, or URL). ' +
      'Each method must include the actual phone number, email, or URL — not just "Call us" or "Email support".'
    );
  }

  // Check for "not_found" case — allow if how explains why
  if (methods.length === 0 && contactInst.how && contactInst.how.length >= 20) {
    // Acceptable: no methods but how explains why
    return [];
  }

  // --- Policy checks ---

  const policiesInst = (doc.instructions as Record<string, unknown>)?.policies as {
    site_type?: string;
    policies?: Array<{ topic?: string; summary?: string; details?: string[] }>;
  } | undefined;

  const siteType = (doc.site?.type || "").toLowerCase();
  const isCommerce = ["e-commerce", "ecommerce", "online store", "retail", "marketplace"]
    .some(t => siteType.includes(t));

  // E-commerce sites should have policies
  if (isCommerce && !policiesInst) {
    failures.push(
      'This is an e-commerce site — write instructions.policies with at least shipping or returns info. ' +
      'Check footer links, FAQ, or help pages. If nothing found, write it with an empty policies array.'
    );
  }

  // Non-e-commerce: nudge if policies section not written at all (need it for completion signal)
  if (!isCommerce && !policiesInst) {
    failures.push(
      'instructions.policies not written. Write it with any relevant policies found, or an empty array if none: ' +
      '{ "site_type": "' + (doc.site?.type || "") + '", "policies": [] }'
    );
  }

  // Validate policy content if present
  if (policiesInst?.policies?.length) {
    for (const p of policiesInst.policies) {
      if (!p.details?.length || p.details.every(d => (d || "").length < 10)) {
        failures.push(
          `Policy "${p.topic || "unknown"}" has no real details. Extract actual data — numbers, timeframes, conditions.`
        );
      }
    }
  }

  return failures;
}

// --- Experience Quality Assessment ---

export function assessExperienceQuality(doc: AgentsJsonType): string[] {
  const failures: string[] = [];
  const pres = doc.presentation as Record<string, unknown>;

  // Voice
  const voice = pres?.voice;
  if (!voice || typeof voice !== "string" || voice.length < 20) {
    failures.push(
      `presentation.voice is missing or too short (${typeof voice === "string" ? voice.length : 0} chars). ` +
      'Describe the brand personality based on actual site copy (20+ chars).'
    );
  }

  // Product display
  const pd = pres?.product_display as Record<string, unknown> | undefined;
  if (!pd) {
    failures.push(
      'presentation.product_display is missing. Visit product pages, find image URLs, and write: ' +
      '{ card_template: "markdown template", image_source: "where images come from", key_fields: ["name", "price", ...] }'
    );
  } else {
    if (!pd.card_template || typeof pd.card_template !== "string") {
      failures.push('presentation.product_display.card_template is missing — provide a markdown template for displaying products.');
    }
    if (!pd.image_source || typeof pd.image_source !== "string" || (pd.image_source as string).length < 20) {
      failures.push(
        'presentation.product_display.image_source is missing or too short. ' +
        'Document where product images come from (CDN pattern, API field name, structured data path). Must reference real URLs you found.'
      );
    }
    if (!pd.key_fields || !Array.isArray(pd.key_fields) || (pd.key_fields as unknown[]).length < 3) {
      failures.push('presentation.product_display.key_fields must list 3+ fields to include when displaying products.');
    }
  }

  // Response style
  const rs = pres?.response_style as Record<string, unknown> | undefined;
  if (!rs) {
    failures.push(
      'presentation.response_style is missing. Write: ' +
      '{ found_results: "how to present results", no_results: "what to say when nothing found" }'
    );
  } else {
    if (!rs.found_results || typeof rs.found_results !== "string") {
      failures.push('presentation.response_style.found_results is missing — describe how to present product results.');
    }
    if (!rs.no_results || typeof rs.no_results !== "string") {
      failures.push('presentation.response_style.no_results is missing — describe what to say when nothing is found.');
    }
  }

  return failures;
}

// --- Behavioral Auto-Fill ---

/** Required behavioral instructions injected into every agents.json */
export const REQUIRED_BEHAVIOR_RULES = [
  "Capabilities have priority levels: 'power' tools should be tried first, 'default' tools are standard alternatives, 'fallback' tools are last resort",
  "Prefer JSON API endpoints when documented — they give the best structured results. If search.response_format is 'html', fetch the documented search URL and extract product data from the HTML response instead",
  "When calling any API endpoint documented here, always include Origin and Referer headers matching the site domain (e.g. Origin: https://example.com, Referer: https://example.com/) — BFF endpoints reject requests without them",
  "Return real results with actual links to the site",
  "Answer the specific question asked — no generic advice, no site overviews, no unsolicited recommendations",
  "Follow the presentation guidelines: use the documented voice/tone, format products using the card_template with images when available, and follow response_style for overall formatting",
];

/**
 * Auto-fill behavioral instructions into agents.json.
 * Called after all phases complete. Ensures consuming agents always get
 * critical behavior rules even if the explorer agents didn't write them.
 */
export function autoFillBehavior(doc: AgentsJsonType): void {
  // Ensure instructions.general exists
  if (!doc.instructions?.general) {
    (doc.instructions as Record<string, unknown>).general = {
      language_note: doc.site.language ? `Site language: ${doc.site.language}` : "Check site for language",
      tips: ["Verify information is current before presenting to users"],
    };
  }

  const general = doc.instructions.general as Record<string, unknown>;
  if (!general.behavior) {
    general.behavior = [...REQUIRED_BEHAVIOR_RULES];
  }
}

// --- Capability Priority Assignment ---

export function getCapabilityStatus(
  doc: AgentsJsonType,
  key: "search" | "navigation" | "forms",
): "verified" | "not_found" | "found" | "missing" {
  const caps = doc.capabilities as Record<string, { status?: string }>;
  const status = caps[key]?.status;
  if (status === "verified" || status === "not_found" || status === "found") return status;
  return "missing";
}

export function assignCapabilityPriorities(
  doc: AgentsJsonType,
  searchVerified: boolean,
  browseVerified: boolean,
  formsVerified: boolean = false,
): void {
  const caps = doc.capabilities as Record<string, { status?: string; priority?: string }>;

  if (caps.search) {
    if (searchVerified) caps.search.priority = "power";
    else delete caps.search.priority;
  }

  if (caps.navigation) {
    if (browseVerified) {
      // If search is power, navigation is default. If no search, navigation is power.
      caps.navigation.priority = searchVerified ? "default" : "power";
    } else {
      delete caps.navigation.priority;
    }
  }

  if (caps.forms) {
    if (formsVerified) {
      // Forms enhance search — if search is power, forms is default. Otherwise power.
      caps.forms.priority = searchVerified ? "default" : "power";
    } else {
      delete caps.forms.priority;
    }
  }
}
