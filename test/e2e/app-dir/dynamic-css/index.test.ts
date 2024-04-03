import { FileRef, createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'app dir - dynamic css',
  {
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
      components: new FileRef(path.join(__dirname, 'components')),
      ...(process.env.TEST_NEXT_BABEL === '1'
        ? {
            '.babelrc': `
          {
            "presets": ["next/babel"]
          }
        `,
          }
        : {}),
    },
    skipDeployment: true,
  },
  ({ next }) => {
    if (process.env.TEST_NEXT_BABEL === '1') {
      it('should build successfully with babel preset', async () => {
        const output = next.cliOutput
        expect(output).toContain('Using external babel configuration')
      })
    }

    it('should preload css of dynamic component during SSR', async () => {
      const $ = await next.render$('/ssr')
      const cssLinks = $('link[rel="preload stylesheet"]')
      expect(cssLinks.attr('href')).toContain('.css')
    })
  }
)
