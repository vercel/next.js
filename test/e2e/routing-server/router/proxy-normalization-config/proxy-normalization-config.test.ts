import { nextTestSetup } from 'e2e-utils'

// Proxy URL normalization as documented at
// https://nextjs.org/docs/app/api-reference/config/next-config-js/skipProxyUrlNormalize
for (const option of ['default', 'current', 'alias']) {
  describe(`documented Proxy URL normalization: ${option}`, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: { ROUTING_NORMALIZATION_OPTION: option },
    })
    const raw = option !== 'default'

    async function inspectDataRequest() {
      const requestedPath = `/_next/data/${next.buildId}/inspection.json`
      const response = await next.fetch(`${requestedPath}?value=preserved`, {
        headers: { 'x-nextjs-data': '1' },
      })
      expect(response.status).toBe(200)
      return { requestedPath, body: await response.json() }
    }

    if (raw) {
      // TODO: on Vercel deployments, Proxy sees the normalized `/inspection`
      // even with this option, instead of the data URL as sent. The docs say
      // `request.nextUrl` then holds the requested pathname as sent:
      // https://nextjs.org/docs/app/api-reference/config/next-config-js/skipProxyUrlNormalize#reference
      // @gate !deploy
      it('shows Proxy the data URL as sent', async () => {
        const { requestedPath, body } = await inspectDataRequest()
        expect(body).toMatchObject({
          pathname: requestedPath,
          urlPathname: requestedPath,
          value: 'preserved',
        })
      })
    } else {
      it('shows Proxy the destination path for a data URL', async () => {
        const { body } = await inspectDataRequest()
        expect(body).toMatchObject({
          pathname: '/inspection',
          urlPathname: '/inspection',
          value: 'preserved',
        })
      })
    }

    it('preserves or removes navigation query and headers as documented', async () => {
      const headers = {
        rsc: '1',
        'next-router-state-tree': 'tree-marker',
        'next-router-prefetch': '1',
        'next-router-segment-prefetch': '/_tree',
        'next-hmr-refresh': '1',
      }
      const response = await next.fetch(
        '/inspection?value=preserved&_rsc=query-marker',
        { headers }
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        pathname: '/inspection',
        urlPathname: '/inspection',
        value: 'preserved',
        rscQuery: raw ? 'query-marker' : null,
        navigation: Object.fromEntries(
          Object.entries(headers).map(([name, value]) => [
            name,
            raw ? value : null,
          ])
        ),
      })
    })

    // A deployed application does not expose the local startup log.
    // @force-gate !deploy
    it('warns for the deprecated alias and accepts the current name', () => {
      if (option === 'alias') {
        expect(next.cliOutput).toMatch(/skipMiddlewareUrlNormalize.*deprecated/)
      } else {
        expect(next.cliOutput).not.toMatch(
          /skipMiddlewareUrlNormalize.*deprecated/
        )
      }
    })
  })
}

// This config companion intentionally runs a local build that must fail before
// an application can be deployed.
// @force-gate !deploy
describe('documented conflicting Proxy URL normalization options', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { ROUTING_NORMALIZATION_OPTION: 'conflict' },
  })

  it('rejects configuring the current name and deprecated alias together', async () => {
    const result = await next.build()
    expect(result.exitCode).not.toBe(0)
    expect(result.cliOutput).toMatch(
      /skipProxyUrlNormalize.*skipMiddlewareUrlNormalize.*cannot be set at the same time/
    )
  })
})
