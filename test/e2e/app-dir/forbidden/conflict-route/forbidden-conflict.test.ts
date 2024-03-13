import { nextTestSetup } from 'e2e-utils'

describe('forbidden-conflict', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  const runTests = () => {
    it('should allow to have a valid /forbidden route', async () => {
      const html = await next.render('/forbidden')
      expect(html).toContain("I'm still a valid page")
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
