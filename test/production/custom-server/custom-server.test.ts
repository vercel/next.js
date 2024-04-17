import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'custom server',
  {
    files: __dirname,
    startCommand: 'node server.js',
    dependencies: {
      'get-port': '5.1.1',
    },
  },
  ({ next }) => {
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

      it('should not render pages with react canary', async () => {
        const $ = await next.render$(`/2`)
        expect($('body').text()).toMatch(/pages:/)
        expect($('body').text()).not.toMatch(/canary/)
      })
    })
  }
)

createNextDescribe(
  'custom server with quiet setting',
  {
    files: __dirname,
    startCommand: 'node server.js',
    env: { USE_QUIET: 'true' },
    dependencies: {
      'get-port': '5.1.1',
    },
  },
  ({ next }) => {
    it('should not log any error messages when server is started with "quiet" setting', async () => {
      await next.render(`/error`)
      expect(next.cliOutput).not.toInclude('Server side error')
    })
  }
)
