import path from 'path'
import { pathToFileURL } from 'url'
import { nextTestSetup } from 'e2e-utils'

// Webpack loads PostCSS configs directly instead of through Turbopack's
// execution context, and only accepts plugins provided as strings.
// @force-gate turbopack
describe('postcss-config-import-meta-url', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('resolves import.meta.url in a PostCSS config to the config file', async () => {
    const $ = await next.render$('/')
    const stylesheets = $('link[rel="stylesheet"]')
      .map((_, link) => $(link).attr('href'))
      .get()
    const css = (
      await Promise.all(
        stylesheets.map(async (href) => (await next.fetch(href)).text())
      )
    ).join('\n')

    const match = /--config-url:\s*("[^"]*")/.exec(css)
    expect(match).not.toBeNull()
    const configUrl = JSON.parse(match![1])
    expect(configUrl).toEndWith('/postcss.config.mjs')
    if (!isNextDeploy) {
      expect(configUrl).toBe(
        pathToFileURL(path.join(next.testDir, 'postcss.config.mjs')).href
      )
    }
  })
})
