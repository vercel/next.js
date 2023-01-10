import { createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'app-dir alias handling',
  {
    files: __dirname,
    packageJson: {
      type: 'module',
    },
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    it('should handle typescript paths alias correctly', async () => {
      const html = await next.render('/button')
      expect(html).toContain('click</button>')
    })

    it('should resolve css imports from outside with src folder presented', async () => {
      const browser = await next.browser('/button')
      const fontSize = await browser
        .elementByCss('button')
        .getComputedCss('font-size')
      expect(fontSize).toBe('50px')
    })

    if (!isNextDev) {
      it('should generate app-build-manifest correctly', async () => {
        // Remove other page CSS files:
        const manifest = await next.readJSON(
          path.join('.next', 'app-build-manifest.json')
        )

        expect(manifest.pages).not.toBeEmptyObject()
      })
    }
  }
)
