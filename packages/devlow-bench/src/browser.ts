import type {
  Browser,
  BrowserContext,
  Page,
  Request,
  Response,
} from "playwright-chromium";
import { chromium } from "playwright-chromium";
import { measureTime, reportMeasurement } from "./index.js";
import { resolve } from "path";

interface BrowserSession {
  close(): Promise<void>;
  hardNavigation(url: string, metricName?: string): Promise<Page>;
  softNavigationByClick(metricName: string, selector: string): Promise<void>;
  reload(metricName: string): Promise<void>;
}

async function withRequestMetrics(
  metricName: string,
  page: Page,
  fn: () => Promise<void>
): Promise<void> {
  const activePromises: Promise<void>[] = [];
  const sizeByExtension = new Map<string, number>();
  const requestsByExtension = new Map<string, number>();
  const responseHandler = (response: Response) => {
    activePromises.push(
      (async () => {
        const url = response.request().url();
        const status = response.status();
        const extension =
          /^[^\?#]+\.([a-z0-9]+)(?:[\?#]|$)/i.exec(url)?.[1] ?? "none";
        const currentRequests = requestsByExtension.get(extension) ?? 0;
        requestsByExtension.set(extension, currentRequests + 1);
        if (status >= 200 && status < 300) {
          let body;
          try {
            body = await response.body();
          } catch {}
          if (body) {
            const size = body.length;
            const current = sizeByExtension.get(extension) ?? 0;
            sizeByExtension.set(extension, current + size);
          }
        }
      })()
    );
  };
  try {
    page.on("response", responseHandler);
    await fn();
    await Promise.all(activePromises);
    let totalDownload = 0;
    for (const [extension, size] of sizeByExtension.entries()) {
      reportMeasurement(
        `${metricName}/responseSizes/${extension}`,
        size,
        "bytes"
      );
      totalDownload += size;
    }
    reportMeasurement(`${metricName}/responseSizes`, totalDownload, "bytes");
    let totalRequests = 0;
    for (const [extension, count] of requestsByExtension.entries()) {
      reportMeasurement(
        `${metricName}/requests/${extension}`,
        count,
        "requests"
      );
      totalRequests += count;
    }
    reportMeasurement(`${metricName}/requests`, totalRequests, "requests");
  } finally {
    page.off("response", responseHandler);
  }
}

function networkIdle(page: Page) {
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      page.off("request", requestHandler);
      page.off("requestfailed", requestFinishedHandler);
      page.off("requestfinished", requestFinishedHandler);
    };
    let activeRequests = 0;
    let timeout: NodeJS.Timeout | null = null;
    const requestHandler = (request: Request) => {
      activeRequests++;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };
    const requestFinishedHandler = (request: Request) => {
      activeRequests--;
      if (activeRequests === 0) {
        timeout = setTimeout(() => {
          cleanup();
          resolve();
        }, 300);
      }
    };
    page.on("request", requestHandler);
    page.on("requestfailed", requestFinishedHandler);
    page.on("requestfinished", requestFinishedHandler);
  });
}

class BrowserSessionImpl implements BrowserSession {
  private browser: Browser;
  private context: BrowserContext;
  private page: Page | null;
  constructor(browser: Browser, context: BrowserContext) {
    this.browser = browser;
    this.context = context;
    this.page = null;
  }

  async close() {
    if (this.page) {
      await this.page.close();
    }
    await this.context.close();
    await this.browser.close();
  }

  async hardNavigation(metricName: string, url: string) {
    const page = (this.page = this.page ?? (await this.context.newPage()));
    await withRequestMetrics(metricName, page, async () => {
      measureTime(`${metricName}/start`);
      await page.goto(url, {
        waitUntil: "commit",
      });
      measureTime(`${metricName}/html`, {
        relativeTo: `${metricName}/start`,
      });
      await page.waitForLoadState("domcontentloaded");
      measureTime(`${metricName}/dom`, {
        relativeTo: `${metricName}/start`,
      });
      await page.waitForLoadState("load");
      measureTime(`${metricName}/load`, {
        relativeTo: `${metricName}/start`,
      });
      await page.waitForLoadState("networkidle");
      measureTime(`${metricName}`, {
        relativeTo: `${metricName}/start`,
      });
    });
    return page;
  }

  async softNavigationByClick(metricName: string, selector: string) {
    const page = this.page;
    if (!page) {
      throw new Error(
        "softNavigationByClick() must be called after hardNavigation()"
      );
    }
    await withRequestMetrics(metricName, page, async () => {
      measureTime(`${metricName}/start`);
      const firstResponse = new Promise<void>((resolve) =>
        page.once("response", () => resolve())
      );
      const idle = networkIdle(page);
      await page.click(selector);
      await firstResponse;
      measureTime(`${metricName}/firstResponse`, {
        relativeTo: `${metricName}/start`,
      });
      await idle;
      measureTime(`${metricName}`, {
        relativeTo: `${metricName}/start`,
      });
    });
  }

  async reload(metricName: string) {
    const page = this.page;
    if (!page) {
      throw new Error("reload() must be called after hardNavigation()");
    }
    await withRequestMetrics(metricName, page, async () => {
      measureTime(`${metricName}/start`);
      await page.reload({
        waitUntil: "commit",
      });
      measureTime(`${metricName}/html`, {
        relativeTo: `${metricName}/start`,
      });
      await page.waitForLoadState("domcontentloaded");
      measureTime(`${metricName}/dom`, {
        relativeTo: `${metricName}/start`,
      });
      await page.waitForLoadState("load");
      measureTime(`${metricName}/load`, {
        relativeTo: `${metricName}/start`,
      });
      await page.waitForLoadState("networkidle");
      measureTime(`${metricName}`, {
        relativeTo: `${metricName}/start`,
      });
    });
  }
}

export async function newBrowserSession(options: {
  headless?: boolean;
  devtools?: boolean;
  baseURL?: string;
}): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: options.headless ?? process.env.HEADLESS !== "false",
    timeout: 60000,
  });
  const context = await browser.newContext({
    baseURL: options.baseURL ?? "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
  });
  context.setDefaultTimeout(120000);
  context.setDefaultNavigationTimeout(120000);
  return new BrowserSessionImpl(browser, context);
}

// see next.js/test/lib/browsers/playwright.ts
