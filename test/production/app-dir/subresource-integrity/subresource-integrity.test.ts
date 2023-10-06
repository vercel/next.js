import { createNextDescribe } from 'e2e-utils'
import crypto from 'crypto'
import path from 'path'
import cheerio from 'cheerio'

createNextDescribe(
  'Subresource Integrity',
  {
    files: path.join(__dirname, 'fixture'),
  },
  ({ next }) => {
    function fetchWithPolicy(policy: string | null) {
      return next.fetch('/dashboard', {
        headers: policy
          ? {
              'Content-Security-Policy': policy,
            }
          : {},
      })
    }

    async function renderWithPolicy(policy: string | null) {
      const res = await fetchWithPolicy(policy)

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
      const $ = await next.render$('/dashboard')

      // Find all the script tags with src attributes.
      const elements = $('script[src]')

      // Expect there to be at least 1 script tag with a src attribute.
      expect(elements.length).toBeGreaterThan(0)

      // Collect all the scripts with integrity hashes so we can verify them.
      const files: [string, string][] = []

      // For each of these attributes, ensure that there's an integrity
      // attribute and starts with the correct integrity hash prefix.
      elements.each((i, el) => {
        const integrity = el.attribs['integrity']
        if (!integrity) {
          console.log({ el })
        }
        expect(integrity).toBeDefined()
        expect(integrity).toStartWith('sha256-')

        const src = el.attribs['src']
        expect(src).toBeDefined()

        files.push([src, integrity])
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
  }
)
