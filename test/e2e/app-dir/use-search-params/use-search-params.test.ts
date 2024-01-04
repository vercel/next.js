import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'use-search-params',
  { files: __dirname },
  ({ next, isNextStart }) => {
    if (!isNextStart) {
      it('skip test for dev mode', () => {})
      return
    }

    const message = `useSearchParams() should be wrapped in a suspense boundary at page "/".`

    it('should pass build if useSearchParams is wrapped in a suspense boundary', async () => {
      await next.stop()
      await expect(next.build()).resolves.toEqual({
        exitCode: 0,
        cliOutput: expect.not.stringContaining(message),
      })
    })

    it('should fail build if useSearchParams is not wrapped in a suspense boundary', async () => {
      await next.renameFile('app/layout.js', 'app/layout-suspense.js')
      await next.renameFile('app/layout-no-suspense.js', 'app/layout.js')
      await next.stop()

      await expect(next.build()).resolves.toEqual({
        exitCode: 1,
        cliOutput: expect.stringContaining(message),
      })

      await next.renameFile('app/layout.js', 'app/layout-no-suspense.js')
      await next.renameFile('app/layout-suspense.js', 'app/layout.js')
    })
  }
)
