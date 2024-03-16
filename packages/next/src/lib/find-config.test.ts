import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findConfig } from './find-config'

describe('findConfig()', () => {
  const exampleConfig = {
    basePath: '/docs',
  }
  const configCode = {
    mjs: `
      const config = ${JSON.stringify(exampleConfig)}

      export default config;
    `,
    cjs: `
      const config = ${JSON.stringify(exampleConfig)}

      module.exports = config;
    `,
  }
  type TestPatterns = {
    pkgConfigTypes: ('module' | 'commonjs')[]
    exts: ('js' | 'mjs' | 'cjs' | 'package.json')[]
  }
  const testPatterns: TestPatterns = {
    pkgConfigTypes: ['module', 'commonjs'],
    exts: ['js', 'mjs', 'cjs', 'package.json'],
  }

  for (const pkgConfigType of testPatterns.pkgConfigTypes) {
    for (const ext of testPatterns.exts) {
      it(`should load config properly (type: "${pkgConfigType}", config: ${
        ext === 'package.json' ? 'package.json' : `awsome.config.${ext}`
      })`, async () => {
        // Create fixtures
        const tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-test-'))

        await writeFile(
          join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'nextjs-test',
            type: pkgConfigType,
            ...(ext === 'package.json'
              ? { awsome: { basePath: '/docs' } }
              : {}),
          })
        )

        if (ext !== 'package.json') {
          let configCodeType = ext
          if (configCodeType === 'js') {
            configCodeType = pkgConfigType === 'module' ? 'mjs' : 'cjs'
          }

          await writeFile(
            join(tmpDir, `awsome.config.${ext}`),
            configCode[configCodeType]
          )
        }

        // Test
        const actualConfig = await findConfig(tmpDir, 'awsome')
        expect(actualConfig).toStrictEqual(exampleConfig)
      })
    }
  }
})
