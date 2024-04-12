import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findConfig } from './find-config'

// Jest does not support `import('file://something')` (file: imports) yet.
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
    exts: ('js' | 'mjs' | 'cjs')[]
  }
  const testPatterns: TestPatterns = {
    pkgConfigTypes: ['module', 'commonjs'],
    exts: ['js', 'mjs', 'cjs'],
  }

  for (const pkgConfigType of testPatterns.pkgConfigTypes) {
    for (const ext of testPatterns.exts) {
      it(`should load config properly from *.config.* file (type: "${pkgConfigType}", config: awsome.config.${ext})`, async () => {
        // Create fixtures
        const tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-test-'))

        await writeFile(
          join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'nextjs-test',
            type: pkgConfigType,
          })
        )

        let configCodeType = ext
        if (configCodeType === 'js') {
          configCodeType = pkgConfigType === 'module' ? 'mjs' : 'cjs'
        }
        await writeFile(
          join(tmpDir, `awsome.config.${ext}`),
          configCode[configCodeType]
        )

        // Test
        const actualConfig = await findConfig(tmpDir, 'awsome')
        expect(actualConfig).toStrictEqual(exampleConfig)
      })
    }
  }

  it(`should load config properly from the config in package.json)`, async () => {
    // Create fixtures
    const tmpDir = await mkdtemp(join(tmpdir(), 'nextjs-test-'))

    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'nextjs-test',
        awsome: {
          basePath: '/docs',
        },
      })
    )

    // Test
    const actualConfig = await findConfig(tmpDir, 'awsome')
    expect(actualConfig).toStrictEqual(exampleConfig)
  })
})
