import { nextTestSetup } from 'e2e-utils'

describe('react-owner-stacks-svgr', () => {
  const { next, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    packageJson: { dependencies: { '@svgr/webpack': '8.1.0' } },
  })

  /* eslint-disable jest/no-standalone-expect */
  // Turbopack currently only supports `next dev` and does not support `next
  // build`: https://nextjs.org/docs/architecture/turbopack#unsupported-features
  ;(isNextStart && isTurbopack ? it.skip : it)(
    'renders an SVG that is transformed by @svgr/webpack into a React component',
    async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('svg')).toBeDefined()
    }
  )
  /* eslint-enable jest/no-standalone-expect */
})
