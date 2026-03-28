import type { Browser } from "puppeteer";

let activeBrowser: Browser | null = null;

/**
 * Launch a headless Chrome instance via Puppeteer.
 */
export async function launchChrome(): Promise<{
  browser: Browser;
  wsEndpoint: string;
}> {
  // Dynamic import — puppeteer is optional, only needed for headless/smart modes
  const puppeteer = await import("puppeteer");

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  activeBrowser = browser;
  const wsEndpoint = browser.wsEndpoint();

  return { browser, wsEndpoint };
}

/**
 * Close a Chrome browser instance.
 */
export async function closeChrome(browser: Browser): Promise<void> {
  try {
    await browser.close();
  } catch {
    // Already closed or crashed — ignore
  }
  if (activeBrowser === browser) {
    activeBrowser = null;
  }
}

/**
 * Emergency cleanup — close any active browser on process exit.
 */
export function getActiveBrowser(): Browser | null {
  return activeBrowser;
}
