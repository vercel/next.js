import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

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
})
