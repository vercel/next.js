import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('with babel', () => {
  const { next, isNextStart, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should support babel in app dir', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('hello')
  })

  if (isNextStart) {
    // Turbopack always runs SWC, so this shouldn't be an issue, but this test
    // refers to a webpack-specific output path.
    // https://github.com/vercel/next.js/pull/51067
    ;(isTurbopack ? it.skip : it)(
      'should contain og package files in middleware',
      async () => {
        await retry(async () => {
          const middleware = await next.readFile('.next/server/middleware.js')
          // @vercel/og default font should be bundled
          expect(middleware).not.toContain('noto-sans-v27-latin-regular.ttf')
        })
      }
    )
  }
})
