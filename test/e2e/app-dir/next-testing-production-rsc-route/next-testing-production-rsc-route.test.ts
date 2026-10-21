import { nextTestSetup } from 'e2e-utils'

describe('explicit production RSC route requests', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  const results: Array<{
    exitCode: number | NodeJS.Signals | null
    cliOutput: string
  }> = []
  const routeRenderResults: typeof results = []
  const encodedRouteRenderResults: typeof results = []
  const redirectRouteRenderResults: typeof results = []

  beforeAll(async () => {
    if (isNextDeploy) return
    for (const mode of ['development', 'production']) {
      results.push(
        await next.runCommand(['test', '--run', '--project', `${mode}-route`], {
          env: { NODE_ENV: mode },
        })
      )
      routeRenderResults.push(
        await next.runCommand(
          ['test', '--run', '--project', `${mode}-route-render`],
          {
            env: { NODE_ENV: mode },
          }
        )
      )
      encodedRouteRenderResults.push(
        await next.runCommand(
          ['test', '--run', '--project', `${mode}-route-render-encoded`],
          {
            env: { NODE_ENV: mode },
          }
        )
      )
      redirectRouteRenderResults.push(
        await next.runCommand(
          ['test', '--run', '--project', `${mode}-route-render-redirect`],
          {
            env: { NODE_ENV: mode },
          }
        )
      )
    }
    await next.start()
  })

  it('runs the same explicit route subtree in development and production', () => {
    if (isNextDeploy) return
    for (const result of results) {
      expect(result).toMatchObject({ exitCode: 0 })
      expect(result.cliOutput).toMatch(/Tests\s+5 passed \(5\)/)
    }
  })

  it('matches the ordinary application request values while the app renders its ancestors', async () => {
    if (isNextDeploy) return
    const response = await next.fetch('/acme/reference/alpha/c', {
      headers: {
        'x-route-proof': 'request-value',
        cookie: 'route-session=session-value',
      },
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('data-root-layout="acme"')
    expect(html).toContain('data-provider="acme"')
    const match = html.match(/<div id="route-values">([^<]+)<\/div>/)
    expect(JSON.parse(match[1].replaceAll('&quot;', '"'))).toEqual({
      tenant: 'acme',
      slug: ['alpha', 'c'],
      root: 'acme',
      header: 'request-value',
      cookie: 'session-value',
    })
  })

  it('renders complete route HTML and Flight through the actual AppPage entry in both modes', () => {
    if (isNextDeploy) return
    for (const result of routeRenderResults) {
      if (result.exitCode !== 0) console.error(result.cliOutput)
      expect(result).toMatchObject({ exitCode: 0 })
      expect(result.cliOutput).toMatch(/Tests\s+4 passed \(4\)/)
    }
  })

  it('matches the ordinary application ancestors, query values and request APIs', async () => {
    if (isNextDeploy) return
    const response = await next.fetch(
      '/acme/ancestor/alpha/c?tag=one&tag=two&unicode=%E2%9C%93',
      {
        headers: {
          'x-route-request': 'ordinary',
          'x-route-proof': 'request-value',
          cookie: 'route-session=session-value',
        },
      }
    )
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('data-root-layout="acme"')
    expect(html).toContain('data-provider="acme"')
    const match = html.match(/<div id="ancestor-values">([^<]+)<\/div>/)
    expect(html).toContain('data-nested-layout="acme"')
    expect(html).toContain('data-provider-context="acme"')
    expect(JSON.parse(match[1].replaceAll('&quot;', '"'))).toEqual({
      tenant: 'acme',
      slug: ['alpha', 'c'],
      root: 'acme',
      tag: ['one', 'two'],
      unicode: '✓',
      header: 'request-value',
      cookie: 'session-value',
    })
  })

  it('matches complete normal-app route rows for encoded inputs in both modes', () => {
    if (isNextDeploy) return
    for (const result of encodedRouteRenderResults) {
      if (result.exitCode !== 0) console.error(result.cliOutput)
      expect(result).toMatchObject({ exitCode: 0 })
      expect(result.cliOutput).toMatch(/Tests\s+10 passed \(10\)/)
    }
  })

  it('matches normal temporary and permanent redirects and following requests', () => {
    if (isNextDeploy) return
    for (const result of redirectRouteRenderResults) {
      if (result.exitCode !== 0) console.error(result.cliOutput)
      expect(result).toMatchObject({ exitCode: 0 })
      expect(result.cliOutput).toMatch(/Tests\s+6 passed \(6\)/)
    }
  })
})
