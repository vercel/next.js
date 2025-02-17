import { nextTestSetup } from 'e2e-utils'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18
// TODO(new-dev-overlay): Remove this once new dev overlay is stable
const isExperimentalReact = Boolean(process.env.__NEXT_EXPERIMENTAL_PPR)

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
    if (!isExperimentalReact) {
      it('should render app with react canary', async () => {
        const $ = await next.render$(`/1`)
        expect($('body').text()).toMatch(/app: .+-canary/)
      })
    }

    it('should render pages with installed react', async () => {
      const $ = await next.render$(`/2`)
      if (isReact18) {
        expect($('body').text()).toMatch(/pages: 18\.\d+\.\d+\{/)
      } else {
        expect($('body').text()).toMatch(/pages: 19.0.0/)
      }
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
