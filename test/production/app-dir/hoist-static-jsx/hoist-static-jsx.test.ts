import { nextTestSetup } from 'e2e-utils'

describe('hoist-static-jsx', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // The transform is only implemented for Turbopack builds.
  const itTurbopack = isTurbopack ? it : it.skip

  it('renders the static subtree', async () => {
    const $ = await next.render$('/')
    expect($('.hero h2').text()).toBe('Welcome')
    expect($('.hero p').text()).toBe('Static content')
  })

  itTurbopack('reuses the static element between requests', async () => {
    const first$ = await next.render$('/')
    const second$ = await next.render$('/')

    // The page is dynamic, so each request renders it again.
    expect(second$('#rendered-at').text()).not.toBe(
      first$('#rendered-at').text()
    )

    // The static subtree passed to Probe is cached in a module-scope
    // variable, so the second render receives the same element object.
    expect(second$('#reused').text()).toBe('true')
  })
})
