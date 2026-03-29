import { nextTestSetup } from 'e2e-utils'

describe('air-boundary-footer', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the footer outside the error boundary in the server HTML when an error occurs inside it', async () => {
    // Fetch the page where an error is thrown inside a Suspense boundary
    // wrapped by an error boundary (the "air boundary"), while a footer
    // sits outside the boundary in the root layout.
    const $ = await next.render$('/server-error')

    // The footer is in the root layout, outside the error boundary.
    // It should be present in the initial server-rendered HTML even though
    // the server component inside the boundary threw an error.
    expect($('#footer').text()).toBe('Footer Content')

    // The Suspense fallback should be visible in the HTML since the
    // server error causes React to fall back to client rendering for
    // that boundary.
    expect($('main').html()).toContain('Loading...')
  })
})
