export type Step = <T>(title: string, body: () => Promise<T>) => Promise<T>

/**
 * When `@playwright/test` is installed and we're running inside the Playwright
 * test runner, wraps the body in a `test.step()` so it appears as a labeled
 * step in the Playwright UI. Otherwise just executes the body directly.
 */
let step: Step = (_title, body) => body()
try {
  const pw = require('@playwright/test') as typeof import('@playwright/test')
  if (typeof pw.test?.step === 'function') {
    const playwrightStep = pw.test.step
    step = async (title, body) => {
      try {
        return await playwrightStep(title, body)
      } catch (e) {
        // If test.step fails because we're not inside the Playwright test
        // runner (e.g., running under Jest), fall back to executing the body
        // directly without step labels.
        if (
          e instanceof Error &&
          e.message.includes('can only be called from a test')
        ) {
          return body()
        }
        throw e
      }
    }
  }
} catch {}

export { step }
