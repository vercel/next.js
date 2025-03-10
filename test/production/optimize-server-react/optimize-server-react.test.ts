import { nextTestSetup } from 'e2e-utils'
;(process.env.TURBOPACK ? describe.skip : describe)(
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
      const file = await next.readFile('.next/server/pages/index.js')
      expect(file).not.toContain('useEffect')
    })
  }
)
