import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next/script beforeInteractive inline payload escaping', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should html-escape forwarded string props so they cannot break out of the inline __next_s script', async () => {
    const html = await next.render('/')

    // The attacker-controlled prop values must not appear verbatim in the HTML.
    // If they do, the `</script>` inside terminates the inline __next_s push
    // script at the HTML tokenizer level and the trailing <script> executes.
    expect(html).not.toContain(
      '</script><script>window.__xssInlineInnerHTML=true</script>'
    )
    expect(html).not.toContain(
      '</script><script>window.__xssInlineChildren=true</script>'
    )
    expect(html).not.toContain('</script><script>window.__xssSrc=true</script>')

    // The fixture's <PwnDetector /> exposes each result as a `data-*`
    // attribute on `[data-testid="xss-status"]`. `data-ready="true"` flips
    // after the effect populates the results.
    //
    //   - `data-xss-*` must all be "false" (no injected script ran)
    //   - `data-escape-proof-*` must all be "true" for the inline scripts —
    //     their bodies evaluate a `<`/`>`/`&&` expression, so `true` proves
    //     both "the script ran" and "the HTML-escape round-trip didn't
    //     mangle the source"
    //   - `data-loaded-src` must be "true" (external script fetched and ran)
    const browser = await next.browser('/')
    const getAttr = (name: string) =>
      browser.elementByCss('[data-testid="xss-status"]').getAttribute(name)

    await retry(async () => {
      expect(await getAttr('data-ready')).toBe('true')
    })

    expect(await getAttr('data-xss-inline-innerhtml')).toBe('false')
    expect(await getAttr('data-xss-inline-children')).toBe('false')
    expect(await getAttr('data-xss-src')).toBe('false')
    expect(await getAttr('data-escape-proof-inline-innerhtml')).toBe('true')
    expect(await getAttr('data-escape-proof-inline-children')).toBe('true')
    expect(await getAttr('data-loaded-src')).toBe('true')
  })
})
