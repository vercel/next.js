import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import semver from 'semver'

if (
  semver.lt(process.version, '16.8.0') ||
  semver.gte(process.version, '18.0.0') ||
  (global as any).isNextDeploy
) {
  it('skipping for Node.js versions <16.8.0 and >18.0.0', () => {
    expect(true).toBe(true)
  })
} else {
  describe('undici fetch', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'pages/api/globalFetch.js': `
            import { ReadableStream } from 'node:stream/web';
            export default async function globalFetch(req, res) {
              try {
                const response = await fetch('https://example.vercel.sh')
                res.json({ value: response.body instanceof ReadableStream })
              } catch (error) {
                console.error(error);
                res.send(error);
              }
            }
          `,
          'pages/api/globalHeaders.js': `
            export default async function globalHeaders(req, res) {
              res.json({
                value: (new Headers())[Symbol.iterator].name === 'entries'
              })
            }
          `,
          'pages/api/globalRequest.js': `
            export default async function globalRequest(req, res) {
              res.json({
                value: (new Request('https://example.vercel.sh')).headers[Symbol.iterator].name === 'entries'
              })
            }
          `,
          'pages/api/globalResponse.js': `
            export default async function globalResponse(req, res) {
              res.json({
                value: (new Response()).headers[Symbol.iterator].name === 'entries'
              })
            }
          `,
        },
        dependencies: {},
        nextConfig: {
          experimental: {
            enableUndici: true,
          },
        },
      })
    })
    afterAll(() => next.destroy())

    describe('undici', () => {
      it('global fetch should return true when undici is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalFetch')
        const data = await result.json()
        expect(data.value).toBe(true)
      })

      it('global Headers should return true when undici is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalHeaders')
        const data = await result.json()
        expect(data.value).toBe(true)
      })

      it('global Request should return true when undici is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalRequest')
        const data = await result.json()
        expect(data.value).toBe(true)
      })

      it('global Response should return true when undici is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalResponse')
        const data = await result.json()
        expect(data.value).toBe(true)
      })
    })

    describe('node-fetch', () => {
      beforeAll(async () => {
        await next.stop()
        await next.patchFile(
          'next.config.js',
          `module.exports = ${JSON.stringify({
            experimental: {
              enableUndici: false,
            },
          })}`
        )
        await next.start()
      })

      it('global fetch should return false when node-fetch is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalFetch')
        const data = await result.json()
        expect(data.value).toBe(false)
      })

      it('global Headers should return false when node-fetch is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalHeaders')
        const data = await result.json()
        expect(data.value).toBe(false)
      })

      it('global Request should return false when node-fetch is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalRequest')
        const data = await result.json()
        expect(data.value).toBe(false)
      })

      it('global Response should return false when node-fetch is used', async () => {
        const result = await fetchViaHTTP(next.url, '/api/globalResponse')
        const data = await result.json()
        expect(data.value).toBe(false)
      })
    })
  })
}
