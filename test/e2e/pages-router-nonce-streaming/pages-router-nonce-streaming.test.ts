import { nextTestSetup } from 'e2e-utils'

describe('Pages Router - CSP nonce on streamed Suspense scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('nonces every inline script emitted while streaming', async () => {
    const $ = await next.render$('/')

    // Guards against the assertion below passing for the wrong reason: if the
    // page ever stops streaming there are no reveal scripts to nonce at all.
    const revealScripts = $('script').filter((_, element) => {
      return /\$R[A-Z]?=/.test($(element).html() || '')
    })
    expect(revealScripts.length).toBeGreaterThan(0)

    // Asserted over every inline script rather than a known prefix: React emits
    // more than one kind (the reveal runtime and a reveal-timing script), and
    // matching on their contents would silently miss any it renames or adds.
    const unnoncedInlineScripts = $('script')
      .filter((_, element) => {
        const $element = $(element)
        return !$element.attr('src') && !$element.attr('nonce')
      })
      .map((_, element) => ($(element).html() || '').slice(0, 60))
      .get()

    expect(unnoncedInlineScripts).toEqual([])
  })
})
