import { nextTestSetup } from 'e2e-utils'
import { getDistDir } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'optimize-server-react',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should work with useEffect', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
    })

    it('should optimize useEffect call on server side', async () => {
      const file = await next.readFile(getDistDir() + '/server/pages/index.js')
      expect(file).not.toContain('useEffect')
    })
  }
)
