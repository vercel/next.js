import { nextTestSetup } from 'e2e-utils'

describe('Pages Router Suspense SSR', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders a large completed Suspense boundary instead of its fallback', async () => {
    const html = await next.render('/')

    // The content of a boundary that never suspended belongs in the HTML, and
    // its fallback does not. An outlined boundary emits both, which leaves
    // clients without JavaScript looking at the fallback.
    expect(html).toContain('chunk-of-server-rendered-text')
    expect(html).not.toContain('Loading large content')
  })

  it('does not park completed content behind a reveal script', async () => {
    const html = await next.render('/')

    expect(html).not.toMatch(/<div hidden id="S:\d+"/)
    expect(html).not.toContain('$RC')
  })

  it('shows the content once the page has hydrated', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementById('content').text()).toContain(
      'chunk-of-server-rendered-text'
    )
  })
})
