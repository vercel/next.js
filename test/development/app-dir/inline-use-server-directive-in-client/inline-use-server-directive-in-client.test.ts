import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource, waitForRedbox } from 'next-test-utils'

describe('inline-use-server-directive-in-client', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('reports the inline "use server" error instead of a bogus "use client" placement error', async () => {
    const browser = await next.browser('/')

    await waitForRedbox(browser)
    const source = await getRedboxSource(browser)

    expect(source).toContain(
      'It is not allowed to define inline "use server" annotated Server Actions in Client Components.'
    )
    expect(source).not.toContain('must be placed before other expressions')
  })
})
