import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from 'playwright/test'
import {
  withProductionBrowser,
  withMeasuredPage,
} from '../../../lib/bundle-optimizer/browser-js.js'

type SourceMap = {
  sources?: string[]
  sections?: { map: SourceMap }[]
}

function sourceMapSources(map: SourceMap): string[] {
  assert(Array.isArray(map.sources) || Array.isArray(map.sections))
  return [
    ...(map.sources ?? []),
    ...(map.sections ?? []).flatMap(({ map }) => sourceMapSources(map)),
  ]
}

export async function measureBrowserJs() {
  return withProductionBrowser(async (browser, url) => {
    const staticDir = join('.next', 'static')
    const maps = (await readdir(staticDir, { recursive: true })).filter(
      (file) => file.endsWith('.js.map')
    )
    assert(maps.length > 0, 'Missing browser JavaScript source maps')
    const sources = (
      await Promise.all(
        maps.map(async (file) =>
          sourceMapSources(
            JSON.parse(await readFile(join(staticDir, file), 'utf8'))
          )
        )
      )
    ).flat()
    assert(sources.length > 0, 'Missing browser JavaScript source-map sources')
    const markdownSources = [
      ...new Set(sources.map((source) => source.replaceAll('\\', '/'))),
    ].filter((source) =>
      /\/node_modules\/(?:.*\/)?(?:react-markdown|remark-gfm|rehype-highlight|micromark(?:-[^/]+)?|mdast-util-[^/]+|lowlight|highlight\.js)\//.test(
        source
      )
    )
    if (process.env.NEXT_EVAL_BROWSER_JS_PHASE === 'before') {
      assert(
        markdownSources.some((source) => /\/react-markdown\//.test(source)),
        'Baseline browser source maps must contain the Markdown renderer'
      )
    }
    return withMeasuredPage(browser, url, async (page, snapshot) => {
      await expect(
        page.getByRole('heading', { name: 'Release Notes', level: 1 })
      ).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Quarterly plan', level: 2 })
      ).toBeVisible()
      await expect(page.locator('article ul')).toBeVisible()
      await expect(page.locator('article ul > li')).toHaveText([
        'Ship the browser performance work',
        'Keep the release notes readable',
      ])
      const code = page.locator('article pre > code')
      await expect(code).toBeVisible()
      await expect(code).toHaveText("const target = 'fast initial load'\n")
      await expect(code).toHaveClass(/language-js/)
      await expect(code.locator('.hljs-keyword')).toHaveText('const')
      await expect(code.locator('.hljs-string')).toHaveText(
        "'fast initial load'"
      )
      return {
        initial: await snapshot(),
        content: { formattedReleaseNotes: true },
        markdownSources,
      }
    })
  })
}
