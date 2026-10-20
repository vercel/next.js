import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'
import cheerio from 'cheerio'

// The inlined chunk-group bootstrap that `experimental.turbopackSharedRuntime`
// emits: `(globalThis["TURBOPACK"] || ...).push({"otherChunks":...})`.
const BOOTSTRAP_MARKER = '"otherChunks"'

function getNonce(csp: string | null): string {
  const match = csp?.match(/'nonce-([^']+)'/)
  if (!match) throw new Error(`Expected a nonce in the CSP header: ${csp}`)
  return match[1]
}

function getBootstrapScripts(html: string) {
  const $ = cheerio.load(html)
  return $('script:not([src])')
    .toArray()
    .filter((element) => $(element).html()!.includes(BOOTSTRAP_MARKER))
    .map((element) => ({ nonce: $(element).attr('nonce') }))
}

// The params of the (single) bootstrap `globalThis[...].push(<params>)`.
function getBootstrapParams(html: string): {
  otherChunks: Array<string | { path: string }>
} {
  const $ = cheerio.load(html)
  const script = $('script:not([src])')
    .toArray()
    .map((element) => $(element).html()!)
    .find((content) => content.includes(BOOTSTRAP_MARKER))!
  const start = script.indexOf('.push(') + '.push('.length
  return JSON.parse(script.slice(start, script.lastIndexOf(')')))
}

async function expectNoUnexpectedCspViolations(browser: Playwright) {
  if (global.browserName !== 'chrome') return

  const logs = await browser.log()
  const cspViolations = logs.filter(
    (log) =>
      log.message.includes('Content Security Policy') &&
      // React's `$RT` timing script in the static shell has no nonce
      // either. It doesn't affect hydration, so only the inline scripts
      // that matter are checked below.
      !log.message.includes('Executing inline script')
  )
  expect(cspViolations).toEqual([])
  const inlineViolations = logs.filter((log) =>
    log.message.includes('Executing inline script')
  )
  // At most the `$RT` script may be blocked.
  expect(inlineViolations.length).toBeLessThanOrEqual(1)
}

// The shared runtime (and thus the inlined bootstrap) only exists in Turbopack
// production builds.
// @force-gate !dev && turbopack
describe('ppr-shared-runtime-csp-nonce', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should emit the bootstrap with the request nonce in the resumed dynamic part, not in the static shell', async () => {
    let csp: string | null = null
    const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(
      async () => {
        const res = await next.fetch('/')
        csp = res.headers.get('content-security-policy')
        return res.body
      }
    )
    const nonce = getNonce(csp)
    // The fixture allows the Vercel toolbar that preview deployments inject.
    expect(csp).toContain(
      `script-src 'self' 'nonce-${nonce}' https://vercel.live;`
    )

    expect(dynamicPart).not.toBe('')
    expect(getBootstrapScripts(staticPart)).toEqual([])
    expect(getBootstrapScripts(dynamicPart)).toEqual([{ nonce }])
  })

  it('should emit the bootstrap with the nonce of a report-only CSP in the resumed dynamic part', async () => {
    let csp: string | null = null
    const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(
      async () => {
        const res = await next.fetch('/?csp=report-only')
        expect(res.headers.get('content-security-policy')).toBeNull()
        csp = res.headers.get('content-security-policy-report-only')
        return res.body
      }
    )
    const nonce = getNonce(csp)

    expect(getBootstrapScripts(staticPart)).toEqual([])
    expect(getBootstrapScripts(dynamicPart)).toEqual([{ nonce }])
  })

  it('should emit the bootstrap without a nonce in the resumed dynamic part when there is no CSP', async () => {
    const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(
      async () => {
        const res = await next.fetch('/?csp=none')
        expect(res.headers.get('content-security-policy')).toBeNull()
        return res.body
      }
    )

    expect(getBootstrapScripts(staticPart)).toEqual([])
    expect(getBootstrapScripts(dynamicPart)).toEqual([{ nonce: undefined }])
  })

  it('should hydrate under a nonce-based CSP without CSP violations for the bootstrap', async () => {
    const browser = await next.browser('/')

    await browser.waitForElementByCss('#counter[data-hydrated="true"]')
    await browser.elementByCss('#counter').click()
    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('1')
    })
    expect(await browser.elementByCss('#dynamic').text()).toBe('dynamic')

    await expectNoUnexpectedCspViolations(browser)
  })

  it('should hydrate when the resumed bootstrap runs after the shared runtime has loaded', async () => {
    // The resume usually reaches the browser after the static shell, e.g. when
    // a CDN serves the shell and the resume comes from a function, by which
    // point the (cached) shared runtime and the entry's chunks may already
    // have run. Make that ordering deterministic: load every chunk of the
    // entry with blocking scripts in the head, so they all run before the
    // parser reaches the bootstrap in the resumed part. The runtime then
    // instantiates the entry from within the inline bootstrap script.
    const browser = await next.browser('/', {
      pushErrorAsConsoleLog: true,
      async beforePageLoad(page) {
        await page.route(
          (url) => url.pathname === '/',
          async (route) => {
            const response = await route.fetch()
            let html = await response.text()

            const blockingScripts = getBootstrapParams(html)
              .otherChunks.map((chunk) =>
                typeof chunk === 'string' ? chunk : chunk.path
              )
              .filter((path) => path.endsWith('.js'))
              .map((path) => `<script src="/_next/${path}"></script>`)
              .join('')

            html = html
              .replace(/(<script src="[^"]+") async=""/g, '$1')
              .replace('</head>', `${blockingScripts}</head>`)
            await route.fulfill({ response, body: html })
          }
        )
      },
    })

    await browser.waitForElementByCss('#counter[data-hydrated="true"]')
    await browser.elementByCss('#counter').click()
    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('1')
    })

    const pageErrors = (await browser.log()).filter(
      (log) =>
        log.source === 'error' &&
        // React's `$RT` timing script in the static shell has no nonce.
        !log.message.includes('Content Security Policy')
    )
    expect(pageErrors).toEqual([])
  })

  it('should keep the bootstrap inline in fully static pages', async () => {
    const html = await next.render('/static')
    expect(getBootstrapScripts(html)).toEqual([{ nonce: undefined }])

    const browser = await next.browser('/static')
    await browser.waitForElementByCss('#counter[data-hydrated="true"]')
    await browser.elementByCss('#counter').click()
    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('1')
    })
  })
})
