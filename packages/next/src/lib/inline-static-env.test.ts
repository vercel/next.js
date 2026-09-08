import fs from 'fs'
import os from 'os'
import path from 'path'
import { inlineStaticEnv } from './inline-static-env'

describe('inlineStaticEnv', () => {
  const ENV_KEY = 'NEXT_PUBLIC_DEEPSEC_TEST'

  beforeEach(() => {
    process.env[ENV_KEY] = 'inlined-value'
  })
  afterEach(() => {
    delete process.env[ENV_KEY]
  })

  it('renames a chunk and its source map to one consistent new hash', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-static-env-'))
    try {
      const distDir = path.join(tmp, '.next')
      const hash = 'aaaaaaaaaaaaaaaa'
      fs.mkdirSync(path.join(distDir, 'static', 'chunks'), {
        recursive: true,
      })
      fs.mkdirSync(path.join(distDir, 'server'), { recursive: true })
      fs.writeFileSync(
        path.join(distDir, 'static', 'chunks', `main-${hash}.js`),
        `console.log(process.env.${ENV_KEY})\n//# sourceMappingURL=main-${hash}.js.map\n`
      )
      fs.writeFileSync(
        path.join(distDir, 'static', 'chunks', `main-${hash}.js.map`),
        JSON.stringify({
          version: 3,
          file: `main-${hash}.js`,
          sources: ['input.js'],
          // The map embeds the original source, so it contains the same
          // env reference and is also rewritten.
          sourcesContent: [`console.log(process.env.${ENV_KEY})`],
        })
      )
      fs.writeFileSync(
        path.join(distDir, 'build-manifest.json'),
        JSON.stringify({ pages: { '/': [`static/chunks/main-${hash}.js`] } })
      )

      await inlineStaticEnv({ distDir, config: { env: {} } as any })

      const manifest = JSON.parse(
        fs.readFileSync(path.join(distDir, 'build-manifest.json'), 'utf8')
      )
      const chunkRef: string = manifest.pages['/'][0]
      const newHash = chunkRef.match(/main-([a-z0-9]{16})\.js/)![1]
      expect(newHash).not.toBe(hash)

      // The manifest references a chunk that actually exists...
      expect(fs.existsSync(path.join(distDir, chunkRef))).toBe(true)
      // ...and its sourcemap link resolves to an existing map with the same hash.
      const chunkContent = fs.readFileSync(path.join(distDir, chunkRef), 'utf8')
      expect(chunkContent).toContain('sourceMappingURL=main-' + newHash + '.js.map')
      expect(
        fs.existsSync(
          path.join(distDir, 'static', 'chunks', `main-${newHash}.js.map`)
        )
      ).toBe(true)

      // The env value was inlined into both files.
      expect(chunkContent).toContain('"inlined-value"')
      const mapContent = fs.readFileSync(
        path.join(distDir, 'static', 'chunks', `main-${newHash}.js.map`),
        'utf8'
      )
      expect(mapContent).toContain('inlined-value')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
