import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import type { Browser } from 'playwright/test'
import type { JavaScriptSummary } from '../../lib/bundle-optimizer/browser-js.js'
import {
  withProductionBrowser,
  withMeasuredPage,
  summarizeJavaScript,
} from '../../lib/bundle-optimizer/browser-js.js'

async function measureEditor(
  browser: Browser,
  url: string
): Promise<{
  initial: JavaScriptSummary & {
    editorLoaded: boolean
  }
  editor: JavaScriptSummary & {
    preloaded: boolean
  }
}> {
  return withMeasuredPage(
    browser,
    url,
    async (page, snapshot) => {
      await expect(
        page.getByRole('heading', { name: 'Formula Workspace' })
      ).toBeVisible()
      await expect(page.locator('.cm-content')).toHaveCount(0)
      const loadedInitially = await snapshot()
      const initial = {
        ...loadedInitially,
        editorLoaded: loadedInitially.requests.some(
          (request) => request.editor
        ),
      }
      const button = page.getByRole('button', { name: 'Open formula editor' })
      const preload = page.waitForResponse(
        (response) =>
          response.ok() &&
          /javascript/.test(response.headers()['content-type'] ?? ''),
        { timeout: 10_000 }
      )
      await button.hover()
      await preload.catch((error) => {
        if (error.name !== 'TimeoutError') throw error
      })
      const loaded = await snapshot()
      const preloaded = loaded.requests
        .slice(initial.requests.length)
        .some((request) => request.editor)
      await expect(page.locator('.cm-content')).toHaveCount(0)
      await button.click()
      const editor = page.locator('.cm-content')
      await expect(editor).toBeVisible()
      await expect(editor).toHaveText('revenue - costs')
      await editor.fill('revenue - costs + 1')
      await expect(editor).toHaveText('revenue - costs + 1')
      const opened = await snapshot()
      assert(
        opened.requests.some((request) => request.editor),
        'CodeMirror runtime was not identified'
      )
      return {
        initial,
        editor: {
          ...summarizeJavaScript(
            opened.requests.slice(initial.requests.length)
          ),
          preloaded,
        },
      }
    },
    (body) => ({
      // CodeMirror's DOM class survives minification of its runtime.
      editor: body.includes('cm-content'),
    })
  )
}

await withProductionBrowser(async (browser, url) => {
  const measurement = await measureEditor(browser, url)
  console.log('NEXT_EVAL_BROWSER_JS:' + JSON.stringify(measurement))
})
