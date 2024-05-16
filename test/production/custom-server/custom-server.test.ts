import { nextTestSetup } from 'e2e-utils'

describe('custom server', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
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
    it('should render app with react beta', async () => {
      const $ = await next.render$(`/1`)
      expect($('body').text()).toMatch(/app: .+-beta/)
    })

    it('should render pages with installed react', async () => {
      const $ = await next.render$(`/2`)
      expect($('body').text()).toMatch(/pages:/)
      // TODO: should not match beta once React 19 stable is out
      expect($('body').text()).toMatch(/beta/)
    })
  })
})

describe('custom server with quiet setting', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
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
