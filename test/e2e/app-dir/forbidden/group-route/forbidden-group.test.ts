import { nextTestSetup } from 'e2e-utils'

describe('forbidden-group', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  const runTests = () => {
    it('should use the forbidden page under group routes', async () => {
      const browser = await next.browser('/blog')
      expect(await browser.elementByCss('h1').text()).toContain('Group Layout')
      expect(await browser.elementByCss('#forbidden').text()).toContain(
        'Forbidden!'
      )
    })
  }

  describe('with default runtime', () => {
    runTests()
  })

  describe('with runtime = edge', () => {
    let originalLayout = ''
    const FILE_PATH = 'app/layout.tsx'

    beforeAll(async () => {
      await next.stop()
      originalLayout = await next.readFile(FILE_PATH)
      await next.patchFile(
        FILE_PATH,
        `export const runtime = 'edge'\n${originalLayout}`
      )
      await next.start()
    })
    afterAll(async () => {
      await next.patchFile(FILE_PATH, originalLayout)
    })

    runTests()
  })
})
