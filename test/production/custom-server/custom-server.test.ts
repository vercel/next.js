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
})
