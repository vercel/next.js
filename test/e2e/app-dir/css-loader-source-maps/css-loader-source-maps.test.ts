import { SourceMap } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isNextDev, nextTestSetup } from 'e2e-utils'

describe('css-loader-source-maps', () => {
  const { next } = nextTestSetup({ files: __dirname })

  function sourceUrl(filename: string) {
    if (process.env.IS_TURBOPACK_TEST) {
      return isNextDev
        ? pathToFileURL(path.join(next.testDir, filename)).href
        : `turbopack:///[project]/${filename}`
    }
    return isNextDev ? `webpack:///${filename}` : `webpack://_N_E/${filename}`
  }

  async function stylesheet(id: string) {
    const $ = await next.render$('/')
    const className = $(`#${id}`).attr('class')
    expect(className).toBeDefined()
    const selector = `.${className}`
    const stylesheets = $('link[rel="stylesheet"]')
      .map((_, element) => $(element).attr('href'))
      .get()

    for (const href of stylesheets) {
      const response = await next.fetch(href)
      expect(response.status).toBe(200)
      const css = await response.text()
      const offset = css.indexOf(selector)
      if (offset === -1) continue

      const mapUrl = css.match(/\/\*#\s*sourceMappingURL=(.*?)\s*\*\//)?.[1]
      expect(mapUrl).toBeDefined()
      return { css, offset, mapUrl, href }
    }
    throw new Error(`No stylesheet contained ${selector}`)
  }

  async function originalLocation(id: string) {
    const { css, offset, mapUrl, href } = await stylesheet(id)
    const map = mapUrl.startsWith('data:')
      ? JSON.parse(Buffer.from(mapUrl.split(',')[1], 'base64').toString())
      : await next
          .fetch(new URL(mapUrl, new URL(href, next.url)).href)
          .then(async (result) => {
            expect(result.status).toBe(200)
            return result.json()
          })
    const before = css.slice(0, offset).split('\n')
    const entry = new SourceMap(map).findEntry(
      before.length - 1,
      before[before.length - 1].length
    )
    return {
      source: entry.originalSource?.replace(/\\/g, '/'),
      line: entry.originalLine + 1,
    }
  }

  it('applies the generated and plain styles in the browser', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#box').getComputedCss('color')).toBe(
      'rgb(255, 0, 0)'
    )
    expect(
      await browser.elementByCss('#imported').getComputedCss('color')
    ).toBe('rgb(10, 20, 30)')
    expect(await browser.elementByCss('#plain').getComputedCss('color')).toBe(
      'rgb(30, 20, 10)'
    )
  })

  // Vercel forbids public source-map requests; other hosts can serve the maps.
  // @force-gate !vercel
  describe('served source maps', () => {
    it('maps loader-generated CSS to the original declaration', async () => {
      expect(await originalLocation('box')).toEqual({
        source: sourceUrl('theme.module.less'),
        line: 2,
      })
    })

    it('preserves imported source provenance', async () => {
      expect(await originalLocation('imported')).toEqual({
        source: sourceUrl('tokens.less'),
        line: 2,
      })
    })

    it('maps plain CSS to its original declaration', async () => {
      expect(await originalLocation('plain')).toEqual({
        source: sourceUrl('plain.module.css'),
        line: 5,
      })
    })
  })

  // @force-gate vercel
  it('does not expose source maps on Vercel', async () => {
    for (const id of ['box', 'imported', 'plain']) {
      const { mapUrl, href } = await stylesheet(id)
      expect(mapUrl).not.toMatch(/^data:/)
      const response = await next.fetch(
        new URL(mapUrl, new URL(href, next.url)).href
      )
      expect(response.status).toBe(403)
    }
  })
})
