import { NoFallbackError } from 'next/dist/shared/lib/no-fallback-error.external'

describe('NoFallbackError', () => {
  it('is an Error subclass', () => {
    expect(new NoFallbackError()).toBeInstanceOf(Error)
  })

  it('mentions the most common cause and links to the docs', () => {
    // Regression for #87738: previously the message was the unhelpful
    // "Internal: NoFallbackError". The new message must point users at
    // the dynamicParams/generateStaticParams interaction that produces
    // this condition in practice.
    const err = new NoFallbackError()
    expect(err.message).toMatch(/dynamicParams/)
    expect(err.message).toMatch(/generateStaticParams/)
    expect(err.message).toMatch(/nextjs\.org\/docs\//)
  })
})
