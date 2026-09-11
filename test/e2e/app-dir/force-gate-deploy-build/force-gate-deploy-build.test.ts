import { nextTestSetup } from 'e2e-utils'

// Route-segment revalidate is incompatible with Cache Components.
// The gate must prevent the build, not just skip the assertion afterward.
// @force-gate !cacheComponents
describe('force-gate-deploy-build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders a page with route-segment revalidation', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
