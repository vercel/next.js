import { nextTestSetup } from 'e2e-utils'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

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
    `set cache \\["[A-Za-z0-9_-]{21}","(?:[0-9a-f]{2})+",\\[{"id":"${id}"},"\\$undefined"\\]\\] requestId: \\d+`
  )
}
