import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Non-Next externalization', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'app'),
      skipStart: true,
    })

    it('Externalized non-Next dist-using package', async () => {
      await next.build()
      const content = await next.readFile('.next/server/pages/index.js')
      expect(content).not.toContain('BrokenExternalMarker')
    })
  })
})
