import { nextTestSetup } from 'e2e-utils'
import { createProxyServer } from 'next/experimental/testmode/proxy'

describe('testmode', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
  })

  if (skipped) {
    return
  }

  let proxyServer: Awaited<ReturnType<typeof createProxyServer>>

  beforeEach(async () => {
    proxyServer = await createProxyServer({
      onFetch: async (testData, request) => {
        if (
          request.method === 'GET' &&
          [
            'https://example.com/',
            'https://next-data-api-endpoint.vercel.app/api/random',
          ].includes(request.url)
        ) {
          return new Response(testData)
        }
        if (
          request.method === 'GET' &&
          request.url === 'https://example.com/middleware'
        ) {
          return new Response(`middleware-${testData}`)
        }
        return undefined
      },
    })
  })

  afterEach(async () => {
    proxyServer.close()
  })

  const fetchForTest = async (url: string, testData?: string) => {
    return next.fetch(url, {
      headers: {
        'Next-Test-Proxy-Port': String(proxyServer.port),
        'Next-Test-Data': testData ?? 'test1',
      },
    })
  }

  describe('app router', () => {
    it('should fetch real data when Next-Test-* headers are not present', async () => {
      const html = await (await next.fetch('/app/rsc-fetch')).text()
      expect(html).not.toContain('<pre>test1</pre>')
    })

    it('should handle RSC with fetch in serverless function', async () => {
      const html = await (await fetchForTest('/app/rsc-fetch')).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should avoid fetch cache', async () => {
      const html1 = await (await fetchForTest('/app/rsc-fetch')).text()
      expect(html1).toContain('<pre>test1</pre>')

      const html2 = await (await fetchForTest('/app/rsc-fetch', 'test2')).text()
      expect(html2).toContain('<pre>test2</pre>')
    })

    it('should handle RSC with http.get in serverless function', async () => {
      const html = await (await fetchForTest('/app/rsc-httpget')).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle RSC with fetch in edge function', async () => {
      const html = await (await fetchForTest('/app/rsc-fetch-edge')).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle API with fetch in serverless function', async () => {
      const json = await (await fetchForTest('/api/fetch')).json()
      expect(json.text).toEqual('test1')
    })

    it('should handle API with http.get in serverless function', async () => {
      const json = await (await fetchForTest('/api/httpget')).json()
      expect(json.text).toEqual('test1')
    })

    it('should handle API with fetch in edge function', async () => {
      const json = await (await fetchForTest('/api/fetch-edge')).json()
      expect(json.text).toEqual('test1')
    })
  })

  describe('page router', () => {
    it('should handle getServerSideProps with fetch', async () => {
      const html = await (
        await fetchForTest('/pages/getServerSidePropsFetch')
      ).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle getServerSideProps with http.get', async () => {
      const html = await (
        await fetchForTest('/pages/getServerSidePropsHttpGet')
      ).text()
      expect(html).toContain('<pre>test1</pre>')
    })

    it('should handle API with fetch', async () => {
      const json = await (await fetchForTest('/api/pages/fetch')).json()
      expect(json.text).toEqual('test1')
    })

    it('should handle API with http.get', async () => {
      const json = await (await fetchForTest('/api/pages/httpget')).json()
      expect(json.text).toEqual('test1')
    })
  })

  describe('middleware', () => {
    it('should intercept fetchs in middleware', async () => {
      const resp = await fetchForTest('/app/rsc-fetch')
      expect(resp.headers.get('x-middleware-fetch')).toEqual('middleware-test1')
    })
  })

  describe('rewrites', () => {
    it('should handle rewrites', async () => {
      const text = await (await fetchForTest('/rewrite-1')).text()
      expect(text).toEqual('test1')
    })
  })
})
