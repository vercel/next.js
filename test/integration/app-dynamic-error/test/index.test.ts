import { nextBuild } from 'next-test-utils'
import { join } from 'path'
describe('app-dynamic-error', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('throws an error when prerendering a page with config dynamic error', async () => {
        const appDir = join(__dirname, '../../app-dynamic-error')
        const { stderr, code } = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
        })
        expect(stderr).toContain(
          'Error occurred prerendering page "/dynamic-error"'
        )
        expect(code).toBe(1)
      })
    }
  )
})
