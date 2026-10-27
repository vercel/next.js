import { nextTestSetup, isNextDev } from 'e2e-utils'
import { fetchViaRawHttp } from 'next-test-utils'
import { gunzipSync } from 'node:zlib'

// compress.mdx scopes Next compression to next start/custom servers; a
// deployment's compression is controlled by the hosting platform.
for (const variant of [
  { name: 'enabled', compress: true, custom: false },
  { name: 'disabled', compress: false, custom: false },
  { name: 'custom-server compression', compress: true, custom: true },
]) {
  // @force-gate !deploy
  describe('documented compression: ' + variant.name, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: { compress: variant.compress, cacheComponents: false },
      ...(variant.custom
        ? {
            startCommand: 'node server.cjs',
            serverReadyPattern: /Compression contract ready/,
            forcedPort: 'random',
            env: { NODE_ENV: isNextDev ? 'development' : 'production' },
            dependencies: { compression: '1.8.1' },
          }
        : {}),
    })

    for (const path of ['/', '/compressible.txt']) {
      it(
        '[H06] preserves decoded bytes with gzip negotiation at ' + path,
        async () => {
          const response = await fetchViaRawHttp(next.url, path, {
            headers: { 'accept-encoding': 'gzip' },
          })
          expect(response.status).toBe(200)
          const bytes = Buffer.from(await response.arrayBuffer())
          if (variant.compress) {
            expect(response.headers.get('content-encoding')).toBe('gzip')
            // One decompression must reveal the application bytes even when
            // compression is already provided by the custom server.
            const decoded = gunzipSync(bytes).toString('utf8')
            if (path === '/') expect(decoded).toContain('Compression contract')
            else
              expect(decoded).toBe(
                'compressible public file '.repeat(100).trimEnd() + '\n'
              )
          } else {
            expect(response.headers.get('content-encoding')).toBeNull()
            if (path === '/')
              expect(bytes.toString('utf8')).toContain('Compression contract')
            else
              expect(bytes.toString('utf8')).toBe(
                'compressible public file '.repeat(100).trimEnd() + '\n'
              )
          }
        }
      )

      it('[H06] respects identity encoding at ' + path, async () => {
        const response = await fetchViaRawHttp(next.url, path, {
          headers: { 'accept-encoding': 'identity' },
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('content-encoding')).toBeNull()
        expect(await response.text()).toContain(
          path === '/' ? 'Compression contract' : 'compressible public file'
        )
      })
    }
  })
}
