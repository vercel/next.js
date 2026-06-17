import { nextTestSetup } from 'e2e-utils'

describe('app-dir revalidate-dynamic', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('should correctly mark a route handler that uses revalidateTag as dynamic', async () => {
      expect(next.cliOutput).toContain('ƒ /api/revalidate-path')
      expect(next.cliOutput).toContain('ƒ /api/revalidate-tag')
    })
  }

  it.each(['/api/revalidate-path', '/api/revalidate-tag'])(
    `should revalidate the data with %s`,
    async (path) => {
      const browser = await next.browser('/')
      const randomNumber = await browser.elementById('data-value').text()
      await browser.refresh()
      const randomNumber2 = await browser.elementById('data-value').text()

      expect(randomNumber).toEqual(randomNumber2)

      const revalidateRes = await next.fetch(path)
      expect((await revalidateRes.json()).revalidated).toBe(true)

      await browser.refresh()

      const randomNumber3 = await browser.elementById('data-value').text()
      expect(randomNumber).not.toEqual(randomNumber3)
    }
  )
})
