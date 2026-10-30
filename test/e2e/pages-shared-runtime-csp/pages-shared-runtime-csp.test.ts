import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

// The bootstrap params that `experimental.turbopackSharedRuntime` emits per
// route: `{"otherChunks": [...], "runtimeModuleIds": [...]}`. The Pages Router
// embeds them as non-executable JSON blocks so strict `script-src` CSPs keep
// working (https://github.com/vercel/next.js/issues/100906).
const BOOTSTRAP_MARKER = '"otherChunks"'

function getInlineScripts(html: string) {
  const $ = cheerio.load(html)
  return $('script:not([src])')
    .toArray()
    .map((element) => ({
      type: $(element).attr('type'),
      marked: $(element).attr('data-turbopack-bootstrap') !== undefined,
      content: $(element).html()!,
    }))
}

// The shared runtime (and thus the bootstrap) only exists in Turbopack
// production builds.
// @force-gate !dev && turbopack
describe('pages-shared-runtime-csp', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should emit zero executable inline scripts under a strict nonce-less CSP', async () => {
    const res = await next.fetch('/')
    expect(res.headers.get('content-security-policy')).toContain(
      `script-src 'self'`
    )
    expect(res.headers.get('content-security-policy')).not.toContain('nonce')

    const html = await res.text()
    const inlineScripts = getInlineScripts(html)

    // Every inline script must be a non-executable data block.
    for (const script of inlineScripts) {
      expect(script.type).toBe('application/json')
    }

    // The bootstrap params are embedded as marked JSON blocks.
    const bootstraps = inlineScripts.filter((script) =>
      script.content.includes(BOOTSTRAP_MARKER)
    )
    expect(bootstraps.length).toBeGreaterThan(0)
    for (const bootstrap of bootstraps) {
      expect(bootstrap.marked).toBe(true)
      const params = JSON.parse(bootstrap.content)
      expect(Array.isArray(params.otherChunks)).toBe(true)
      expect(Array.isArray(params.runtimeModuleIds)).toBe(true)
    }
  })

  it('should hydrate and stay interactive with the inline bootstrap blocked', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#increment').click()
    expect(await browser.elementByCss('#count').text()).toBe('count: 1')

    if (global.browserName === 'chrome') {
      const logs = await browser.log()
      const cspViolations = logs.filter((log) =>
        log.message.includes('Content Security Policy')
      )
      expect(cspViolations).toEqual([])
    }

    await browser.close()
  })
})
