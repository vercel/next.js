import { isReact18, nextTestSetup } from 'e2e-utils'

describe('custom server', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /^- Local:/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  it.each(['a', 'b', 'c'])('can navigate to /%s', async (page) => {
    const $ = await next.render$(`/${page}`)
    expect($('p').text()).toBe(`Page ${page}`)
  })

  it('should log any error messages when server is started without "quiet" setting', async () => {
    await next.render(`/error`)
    expect(next.cliOutput).toInclude('Server side error')
  })

  it('updates App Router asset URLs when the custom server changes the prefix', async () => {
    const localAssets =
      'script[src^="/_next/static/"], link[href^="/_next/static/"]'
    const prefixedAssets =
      'script[src^="https://cdn.example.com/_next/static/"], link[href^="https://cdn.example.com/_next/static/"]'

    const initial = await next.render$('/asset-prefix')
    expect(initial(localAssets).length).toBeGreaterThan(0)
    expect(initial(prefixedAssets).length).toBe(0)

    const updated = await next.render$('/asset-prefix?assetPrefix=set')
    expect(updated(prefixedAssets).length).toBeGreaterThan(0)

    const reset = await next.render$('/asset-prefix?assetPrefix=reset')
    expect(reset(localAssets).length).toBeGreaterThan(0)
    expect(reset(prefixedAssets).length).toBe(0)
  })

  describe('with app dir', () => {
    it('should render app with react canary', async () => {
      const $ = await next.render$(`/1`)
      expect($('body').text()).toMatch(/app: .+-canary/)
    })

    it('should render pages with installed react', async () => {
      const $ = await next.render$(`/2`)
      if (isReact18) {
        expect($('body').text()).toMatch(/pages: 18\.\d+\.\d+\{/)
      } else {
        expect($('body').text()).toMatch(/pages: 19\.\d+\.\d+/)
      }
    })

    describe('when using "use cache" with a custom cache handler', () => {
      it("should not unset the custom server's ALS context", async () => {
        const cliOutputLength = next.cliOutput.length
        const $ = await next.render$('/use-cache')
        expect($('p').text()).toBe('inner cache')
        const cliOutput = next.cliOutput.slice(cliOutputLength)
        expect(cliOutput).toMatch(createCacheSetLogRegExp('outer'))
        expect(cliOutput).toMatch(createCacheSetLogRegExp('inner'))
      })
    })
  })
})

describe('custom server provided config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /^- Local:/,
    dependencies: {
      'get-port': '5.1.1',
    },
    env: {
      PROVIDED_CONFIG: 'true',
    },
  })

  it.each(['a', 'b', 'c'])('can navigate to /%s', async (page) => {
    const $ = await next.render$(`/docs/${page}`)
    expect($('p').text()).toBe(`Page ${page}`)
  })

  describe('with app dir', () => {
    it('should render app with react canary', async () => {
      const $ = await next.render$(`/docs/1`)
      expect($('body').text()).toMatch(/app: .+-canary/)
    })

    it('should render pages with installed react', async () => {
      const $ = await next.render$(`/docs/2`)
      if (isReact18) {
        expect($('body').text()).toMatch(/pages: 18\.\d+\.\d+\{/)
      } else {
        expect($('body').text()).toMatch(/pages: 19\.\d+\.\d+/)
      }
    })

    describe('when using "use cache" with a custom cache handler', () => {
      it("should not unset the custom server's ALS context", async () => {
        const cliOutputLength = next.cliOutput.length
        const $ = await next.render$('/docs/use-cache')
        expect($('p').text()).toBe('inner cache')
        const cliOutput = next.cliOutput.slice(cliOutputLength)
        expect(cliOutput).toMatch(createCacheSetLogRegExp('outer'))
        expect(cliOutput).toMatch(createCacheSetLogRegExp('inner'))
      })
    })
  })
})

describe('custom server with quiet setting', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /^- Local:/,
    env: { USE_QUIET: 'true' },
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  it('should not log any error messages when server is started with "quiet" setting', async () => {
    await next.render(`/error`)
    expect(next.cliOutput).not.toInclude('Server side error')
  })
})

function createCacheSetLogRegExp(id: string) {
  // Expect a requestId, that's provided through ALS, to be present in the log
  // message for the cache handler set call.
  return new RegExp(
    `set cache \\["(?:[0-9a-f]{2})+",\\[{"id":"${id}"}\\],\\["[A-Za-z0-9_-]+"(?:,"[^"]+")*\\]\\] requestId: \\d+`
  )
}
