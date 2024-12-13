import { nextTestSetup } from 'e2e-utils'
import crypto from 'crypto'
import path from 'path'
import cheerio from 'cheerio'

// This test suite is skipped with Turbopack because it's testing an experimental feature. To be implemented after stable.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Subresource Integrity',
  () => {
    describe.each(['node', 'edge'])('with %s runtime', (runtime) => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixture'),
      })

      function fetchWithPolicy(policy: string | null, reportOnly?: boolean) {
        const cspKey = reportOnly
          ? 'Content-Security-Policy-Report-Only'
          : 'Content-Security-Policy'
        return next.fetch(`/${runtime}`, {
          headers: policy
            ? {
                [cspKey]: policy,
              }
            : {},
        })
      }

      async function renderWithPolicy(
        policy: string | null,
        reportOnly?: boolean
      ) {
        const res = await fetchWithPolicy(policy, reportOnly)

        expect(res.ok).toBe(true)

        const html = await res.text()

        return cheerio.load(html)
      }

      it('does not include nonce when not enabled', async () => {
        const policies = [
          `script-src 'nonce-'`, // invalid nonce
          'style-src "nonce-cmFuZG9tCg=="', // no script or default src
          '', // empty string
        ]

        for (const policy of policies) {
          const $ = await renderWithPolicy(policy)

          // Find all the script tags without src attributes and with nonce
          // attributes.
          const elements = $('script[nonce]:not([src])')

          // Expect there to be none.
          expect(elements.length).toBe(0)
        }
      })

      it('includes a nonce value with inline scripts when Content-Security-Policy header is defined', async () => {
        // A random nonce value, base64 encoded.
        const nonce = 'cmFuZG9tCg=='

        // Validate all the cases where we could parse the nonce.
        const policies = [
          `script-src 'nonce-${nonce}'`, // base case
          `   script-src   'nonce-${nonce}' `, // extra space added around sources and directive
          `style-src 'self'; script-src 'nonce-${nonce}'`, // extra directives
          `script-src 'self' 'nonce-${nonce}' 'nonce-othernonce'`, // extra nonces
          `default-src 'nonce-othernonce'; script-src 'nonce-${nonce}';`, // script and then fallback case
          `default-src 'nonce-${nonce}'`, // fallback case
        ]

        for (const policy of policies) {
          const $ = await renderWithPolicy(policy)

          // Find all the script tags without src attributes.
          const elements = $('script:not([src])')

          // Expect there to be at least 1 script tag without a src attribute.
          expect(elements.length).toBeGreaterThan(0)

          // Expect all inline scripts to have the nonce value.
          elements.each((i, el) => {
            expect(el.attribs['nonce']).toBe(nonce)
          })
        }
      })

      it('includes a nonce value with inline scripts when Content-Security-Policy-Report-Only header is defined', async () => {
        // A random nonce value, base64 encoded.
        const nonce = 'cmFuZG9tCg=='

        // Validate all the cases where we could parse the nonce.
        const policies = [
          `script-src 'nonce-${nonce}'`, // base case
          `   script-src   'nonce-${nonce}' `, // extra space added around sources and directive
          `style-src 'self'; script-src 'nonce-${nonce}'`, // extra directives
          `script-src 'self' 'nonce-${nonce}' 'nonce-othernonce'`, // extra nonces
          `default-src 'nonce-othernonce'; script-src 'nonce-${nonce}';`, // script and then fallback case
          `default-src 'nonce-${nonce}'`, // fallback case
        ]

        for (const policy of policies) {
          const $ = await renderWithPolicy(policy, true)

          // Find all the script tags without src attributes.
          const elements = $('script:not([src])')

          // Expect there to be at least 1 script tag without a src attribute.
          expect(elements.length).toBeGreaterThan(0)

          // Expect all inline scripts to have the nonce value.
          elements.each((i, el) => {
            expect(el.attribs['nonce']).toBe(nonce)
          })
        }
      })

      it('includes a nonce value with bootstrap scripts when Content-Security-Policy header is defined', async () => {
        // A random nonce value, base64 encoded.
        const nonce = 'cmFuZG9tCg=='

        // Validate all the cases where we could parse the nonce.
        const policies = [
          `script-src 'nonce-${nonce}'`, // base case
          `   script-src   'nonce-${nonce}' `, // extra space added around sources and directive
          `style-src 'self'; script-src 'nonce-${nonce}'`, // extra directives
          `script-src 'self' 'nonce-${nonce}' 'nonce-othernonce'`, // extra nonces
          `default-src 'nonce-othernonce'; script-src 'nonce-${nonce}';`, // script and then fallback case
          `default-src 'nonce-${nonce}'`, // fallback case
        ]

        for (const policy of policies) {
          const $ = await renderWithPolicy(policy)

          // Find all the script tags without src attributes.
          const elements = $('script[src]')

          // Expect there to be at least 2 script tag with a src attribute.
          // The main chunk and the webpack runtime.
          expect(elements.length).toBeGreaterThan(1)

          // Expect all inline scripts to have the nonce value.
          elements.each((i, el) => {
            expect(el.attribs['nonce']).toBe(nonce)
          })
        }
      })

      it('includes an integrity attribute on scripts', async () => {
        const $ = await next.render$(`/${runtime}`)
        const elements = $('script[src]')

        expect(elements.length).toBeGreaterThan(0)

        // Collect all the scripts with integrity hashes so we can verify them.
        const files: Map<string, string> = new Map()

        elements.each((_index, element) => {
          const integrity = element.attribs['integrity']
          expect(integrity).toBeDefined()
          expect(integrity).toStartWith('sha256-')

          const src = element.attribs['src']
          expect(src).toBeDefined()

          files.set(src, integrity)
        })

        // For each script tag, ensure that the integrity attribute is the
        // correct hash of the script tag.
        for (const [src, integrity] of files) {
          const res = await next.fetch(src)
          expect(res.status).toBe(200)
          const content = await res.text()

          const hash = crypto
            .createHash('sha256')
            .update(content)
            .digest()
            .toString('base64')

          expect(integrity).toEndWith(hash)
        }
      })

      it('throws when escape characters are included in nonce', async () => {
        const res = await fetchWithPolicy(
          `script-src 'nonce-"><script></script>"'`
        )

        expect(res.status).toBe(500)
      })
    })
  }
)
