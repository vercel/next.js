import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir alias',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
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

    if (isNextStart) {
      it('should not contain installed react/react-dom version in client chunks', async () => {
        const appBuildManifest = await next.readJSON(
          '.next/app-build-manifest.json'
        )
        Object.keys(appBuildManifest.pages).forEach((page) => {
          const containFrameworkChunk = appBuildManifest.pages[page].some(
            (chunk) => {
              return chunk.includes('framework')
            }
          )
          expect(containFrameworkChunk).toBe(false)
        })
      })

      it('should generate app-build-manifest correctly', async () => {
        // Remove other page CSS files:
        const manifest = await next.readJSON('.next/app-build-manifest.json')

        expect(manifest.pages).not.toBeEmptyObject()
      })
    }
  }
)
