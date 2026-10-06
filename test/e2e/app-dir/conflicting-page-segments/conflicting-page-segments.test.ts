import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('conflicting-page-segments', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should throw an error when a route groups causes a conflict with a parallel segment', async () => {
    if (isNextDev) {
      await next.start()
      const html = await next.render('/')

      expect(html).toContain(
        'You cannot have two parallel pages that resolve to the same path.'
      )
    } else {
      await expect(next.start()).rejects.toThrow()

      await retry(() => {
        expect(next.cliOutput).toMatch(
          /You cannot have two parallel pages that resolve to the same path\. Please check \/\(group-a\)(\/page)? and \/\(group-b\)(\/page)?\./i
        )
      })
    }
  }, 240_000)
})
