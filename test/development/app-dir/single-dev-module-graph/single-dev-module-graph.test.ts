import { nextTestSetup } from 'e2e-utils'
import { retry, waitForNoRedbox, waitForRedbox } from 'next-test-utils'

function assetUrls($: ReturnType<typeof import('cheerio').load>) {
  return [
    ...$('script[src]')
      .toArray()
      .map((el) => $(el).attr('src')),
    ...$('link[rel="stylesheet"]')
      .toArray()
      .map((el) => $(el).attr('href')),
  ]
}

// `experimental.turbopackSingleDevModuleGraph` only affects `next dev` with Turbopack.
// @force-gate dev && turbopack
describe('single-dev-module-graph', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps the assets of an active route stable when another route activates', async () => {
    const before = assetUrls(await next.render$('/a'))
    expect(before.length).toBeGreaterThan(0)

    const browserB = await next.browser('/b')
    await browserB.elementByCss('#counter-b').click()
    await retry(async () => {
      expect(await browserB.elementByCss('#counter-b').text()).toBe(
        'counter-b: 1'
      )
    })
    await browserB.close()

    const after = assetUrls(await next.render$('/a'))
    expect(after).toEqual(before)

    const browserA = await next.browser('/a')
    await browserA.elementByCss('#counter-a').click()
    await retry(async () => {
      expect(await browserA.elementByCss('#counter-a').text()).toBe(
        'counter-a: 1'
      )
    })
    expect(
      await browserA.eval(
        `getComputedStyle(document.querySelector('#counter-a')).color`
      )
    ).toBe('rgb(0, 128, 0)')
    await waitForNoRedbox(browserA)
  })

  it('reports a compile error in one route and recovers the others', async () => {
    expect((await next.fetch('/a')).status).toBe(200)

    await next.patchFile(
      'app/broken/page.tsx',
      (content) => content!.replace('<p id="page">', '<p id="page">{'),
      async () => {
        const browser = await next.browser('/broken')
        await waitForRedbox(browser)
      }
    )

    await retry(async () => {
      const $ = await next.render$('/broken')
      expect($('#page').text()).toBe('page broken')
    })
    // While any route has a compile error, `next dev` responds with that error, with and without
    // the single module graph. Once it is fixed, the other routes work again.
    await retry(async () => {
      const res = await next.fetch('/a')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('page a')
    })
  })

  it('renders Pages Router pages with the custom _app and _document', async () => {
    const $ = await next.render$('/legacy')
    expect($('#page').text()).toBe('legacy page')
    expect($('#custom-app #page').length).toBe(1)
    expect($('html').attr('data-custom-document')).toBe('true')

    const res = await next.fetch('/api/hello')
    expect(await res.json()).toEqual({ hello: 'world' })

    // Pages Router HTML and data endpoints share the module graph without conflicting modules.
    expect(next.cliOutput).not.toContain('Duplicate module idents')
    expect(next.cliOutput).not.toContain('FATAL')
  })

  it('does not compile routes that are never requested', async () => {
    // Routes with a syntax error that are never requested. `pages/_app+/_document` checks that a
    // route's activation can't collide with the activation `/_app` and `/_document` share.
    const broken = `export default function Page() { return <p>{never visited</p> }`
    await next.patchFile('pages/_app+/_document.tsx', broken, async () => {
      await next.patchFile('app/never-visited/page.tsx', broken, async () => {
        const outputIndex = next.cliOutput.length
        for (const pathname of ['/a', '/b', '/legacy', '/api/hello']) {
          expect((await next.fetch(pathname)).status).toBe(200)
        }
        const output = next.cliOutput.slice(outputIndex)
        expect(output).not.toContain('never-visited')
        expect(output).not.toContain('_app+')
      })
    })
  })

  it('reports issues of routes that are not requested yet through the MCP tool', async () => {
    await next.patchFile(
      'app/never-visited/page.tsx',
      `export default function Page() { return <p>{never visited</p> }`,
      async () => {
        await retry(async () => {
          const response = await fetch(`${next.url}/_next/mcp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'get-compilation-issues',
              method: 'tools/call',
              params: { name: 'get_compilation_issues', arguments: {} },
            }),
          })
          const match = (await response.text()).match(/data: ({.*})/s)
          expect(match).toBeTruthy()
          const { issues } = JSON.parse(
            JSON.parse(match![1]).result.content[0].text
          ) as { issues: Array<{ severity: string; filePath: string }> }
          expect(
            issues.some(
              (issue) =>
                (issue.severity === 'error' || issue.severity === 'fatal') &&
                issue.filePath.includes('never-visited')
            )
          ).toBe(true)
        })

        // Collecting diagnostics doesn't activate the route: other routes keep working.
        expect((await next.fetch('/a')).status).toBe(200)
      }
    )
  })

  it('serves a route that is added while other routes are active', async () => {
    expect((await next.fetch('/a')).status).toBe(200)
    expect((await next.fetch('/b')).status).toBe(200)

    await next.patchFile(
      'app/new/page.tsx',
      `export default function Page() { return <p id="page">page new</p> }`,
      async () => {
        await retry(async () => {
          const $ = await next.render$('/new')
          expect($('#page').text()).toBe('page new')
        })
      }
    )
  })
})
