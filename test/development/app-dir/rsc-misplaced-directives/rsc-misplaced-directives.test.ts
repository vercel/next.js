import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource, waitForRedbox } from 'next-test-utils'

describe('rsc-misplaced-directives', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // This test must run before the one below: once a route fails to compile,
  // the dev server reports the compilation error for every route.
  it('does not error for a pages router page with a directive in a function', async () => {
    const $ = await next.render$('/hello')
    expect($('p').text()).toBe('hello from pages')
  })

  it('errors when a "use client" directive is placed inside a function', async () => {
    const browser = await next.browser('/')

    await waitForRedbox(browser)
    const source = await getRedboxSource(browser)

    expect(source).toContain(
      'The "use client" directive must be placed at the top of the file, before any other statements. It cannot be used inside a function.'
    )
  })
})
