import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import semver from 'semver'

if (semver.gte(process.version, '18.0.0')) {
  it('skipping for Node.js version 18+', () => {
    expect(true).toBe(true)
  })
} else {
  describe('undici fetch', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'pages/api/hello.js': `
            import { ReadableStream } from 'node:stream/web';
            export default async function hello(req, res) {
              try {
                const response = await fetch('https://example.vercel.sh')
                res.json({ value: response.body instanceof ReadableStream })
              } catch (error) {
                console.error(error);
                res.send(error);
              }
            }
          `,
        },
        dependencies: {},
        nextConfig: {
          experimental: {
            useUndici: true,
          },
        },
      })
    })
    afterAll(() => next.destroy())

    it('should return true when undici is used', async () => {
      const result = await fetchViaHTTP(next.url, '/api/hello')
      const data = await result.json()
      expect(data.value).toBe(true)
    })

    it('should return false when node-fetch is used', async () => {
      await next.stop()
      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify({
          experimental: {
            useUndici: false,
          },
        })}`
      )
      await next.start()
      const result = await fetchViaHTTP(next.url, '/api/hello')
      const data = await result.json()
      expect(data.value).toBe(false)
    })
  })
}
