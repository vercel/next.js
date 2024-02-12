import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'conflicting-page-segments',
  {
    files: __dirname,
    // we skip start because the build will fail and we won't be able to catch it
    // start is re-triggered but caught in the assertions below
    skipStart: true,
  },
  ({ next, isNextDev }) => {
    it('should throw an error when a route groups causes a conflict with a parallel segment', async () => {
      if (isNextDev) {
        await next.start()
        const html = await next.render('/')

        expect(html).toContain(
          'You cannot have two parallel pages that resolve to the same path.'
        )
      } else {
        await expect(next.start()).rejects.toThrow('next build failed')

        await check(
          () => next.cliOutput,
          /You cannot have two parallel pages that resolve to the same path\. Please check \/\(group-a\)\/page and \/\(group-b\)\/page\./i
        )
      }
    })
  }
)
