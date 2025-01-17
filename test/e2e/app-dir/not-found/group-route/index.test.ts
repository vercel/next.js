import { nextTestSetup } from 'e2e-utils'

describe('app dir - not-found - group route', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  const runTests = () => {
    it('should use the not-found page under group routes', async () => {
      const browser = await next.browser('/blog')
      expect(await browser.elementByCss('h1').text()).toContain('Group Layout')
      expect(await browser.elementByCss('#not-found').text()).toContain(
        'Not found!'
      )
    })
  }

  describe('with default runtime', () => {
    runTests()
  })

  describe('with runtime = edge', () => {
    let originalLayout = ''

    beforeAll(async () => {
      await next.stop()
      originalLayout = await next.readFile('app/layout.js')
      await next.patchFile(
        'app/layout.js',
        `export const runtime = 'edge'\n${originalLayout}`
      )
      await next.start()
    })
    afterAll(async () => {
      await next.patchFile('app/layout.js', originalLayout)
    })

    runTests()
  })
})
