import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Non-Next externalization', () => {
  describe('production mode', () => {
    const { next, isNextStart } = nextTestSetup({
      files: path.join(__dirname, 'app'),
      skipStart: true,
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('Externalized non-Next dist-using package', async () => {
      await next.build()
      const content = await next.readFile('.next/server/pages/index.js')
      expect(content).not.toContain('BrokenExternalMarker')
    })
  })
})
