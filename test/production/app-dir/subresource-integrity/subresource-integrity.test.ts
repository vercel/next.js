import { nextTestSetup } from 'e2e-utils'
import crypto from 'crypto'
import path from 'path'
import cheerio from 'cheerio'
import { getClientReferenceManifest } from 'next-test-utils'

describe('Subresource Integrity', () => {
  describe.each(['node', 'edge', 'pages'] as const)(
    'with %s runtime',
    (runtime) => {
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
        // pages router doesn't do integrity attribute yet
        if (runtime === 'pages') return

        const $ = await next.render$(`/${runtime}`)
        // Currently webpack chunks loaded via flight runtime do not get integrity
        // hashes. This was previously unobservable in this test because these scripts
        // are inserted by the webpack runtime and immediately removed from the document.
        // However with the advent of preinitialization of chunks used during SSR there are
        // some script tags for flight loaded chunks that will be part of the initial HTML
        // but do not have integrity hashes. Flight does not currently support a way to
        // provide integrity hashes for these chunks. When this is addressed in React upstream
        // we can revisit this tests assertions and start to ensure it actually applies to
        // all SSR'd scripts. For now we will look for known entrypoint scripts and assume
        // everything else in the <head> is part of flight loaded chunks

        // Collect all the scripts with integrity hashes so we can verify them.
        const files: Map<string, string> = new Map()

        function collectFile(el: CheerioElement) {
          const integrity = el.attribs['integrity']
          const src = el.attribs['src']
          expect(src).toBeDefined()
          files.set(src, integrity)
        }

        const clientReferenceManifest = getClientReferenceManifest(
          next,
          `/${runtime}/page`
        )
        const clientReferenceChunks = new Set(
          Object.values(clientReferenceManifest.clientModules).flatMap(
            (clientModule) =>
              clientModule.chunks
                .filter((c) => c.includes('.js'))
                .map(
                  (c) =>
                    new URL(
                      clientReferenceManifest.moduleLoading.prefix + c,
                      'http://localhost'
                    ).pathname
                )
          )
        )

        const headScripts = $('head script[src]')
        expect(headScripts.length).toBeGreaterThan(0)
        headScripts.each((i, el) => {
          collectFile(el)
        })

        const bodyScripts = $('body script[src]')
        expect(bodyScripts.length).toBeGreaterThan(0)
        bodyScripts.each((i, el) => {
          collectFile(el)
        })

        // For each script tag, ensure that the integrity attribute is the
        // correct hash of the script tag.
        let scriptsWithIntegrity = 0
        for (const [src, integrity] of files) {
          const res = await next.fetch(src)
          expect(res.status).toBe(200)
          const content = await res.text()

          if (clientReferenceChunks.has(new URL(src, next.url).pathname)) {
            // this is a flight loaded script, which currently do not have integrity hashes
            continue
          }
          scriptsWithIntegrity++

          const hash = crypto
            .createHash('sha256')
            .update(content)
            .digest()
            .toString('base64')

          expect(integrity).toBe(`sha256-${hash}`)
        }

        // A pretty arbitrary number
        expect(scriptsWithIntegrity).toBeGreaterThanOrEqual(2)
      })

      it('throws when escape characters are included in nonce', async () => {
        const res = await fetchWithPolicy(
          `script-src 'nonce-"><script></script>"'`
        )

        if (runtime === 'node' && process.env.__NEXT_CACHE_COMPONENTS) {
          expect(res.status).toBe(200)
        } else {
          expect(res.status).toBe(500)
        }
      })
    }
  )
})
