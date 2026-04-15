import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Non-Next externalization', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'app'),
        skipStart: true,
      })

      it('Externalized non-Next dist-using package', async () => {
        await next.build()
        const content = await next.readFile('.next/server/pages/index.js')
        expect(content).not.toContain('BrokenExternalMarker')
      })
    }
  )
})
