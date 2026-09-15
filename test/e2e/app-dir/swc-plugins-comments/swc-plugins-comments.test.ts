import { nextTestSetup } from 'e2e-utils'

// Regression test for https://github.com/vercel/next.js/issues/97866:
// Turbopack only passed comments to SWC plugins when a file had both leading
// and trailing comments.
describe('swc-plugins-comments', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      'swc-plugin-coverage-instrument': '0.0.32',
    },
  })
  if (skipped) return

  it('passes comments to plugins for a file with only leading comments', async () => {
    const $ = await next.render$('/')
    expect($('#lib-leading-only-js').text()).toBe('honored')
  })

  it('passes comments to plugins for a file with leading and trailing comments', async () => {
    const $ = await next.render$('/')
    expect($('#lib-with-trailing-js').text()).toBe('honored')
  })
})
