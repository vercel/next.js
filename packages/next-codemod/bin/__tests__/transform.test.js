const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { jscodeshiftExtensions, runTransform } = require('../transform')

describe('transform runner', () => {
  it('includes JavaScript module config extensions', () => {
    expect(jscodeshiftExtensions).toEqual([
      'tsx',
      'ts',
      'jsx',
      'js',
      'mjs',
      'cjs',
    ])
  })

  it.each([
    [
      'mjs',
      "export default { experimental: { turbo: { resolveAlias: { underscore: 'lodash' } } } }",
    ],
    [
      'cjs',
      "module.exports = { experimental: { turbo: { resolveAlias: { underscore: 'lodash' } } } }",
    ],
  ])('transforms next.config.%s files', async (extension, source) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'next-codemod-transform-')
    )
    const configPath = path.join(directory, `next.config.${extension}`)

    try {
      fs.writeFileSync(configPath, source)

      await runTransform('next-experimental-turbo-to-turbopack', directory, {
        force: true,
        runInBand: true,
      })

      const transformed = fs.readFileSync(configPath, 'utf8')
      expect(transformed).toContain('turbopack: {')
      expect(transformed).toContain("underscore: 'lodash'")
      expect(transformed).not.toContain('experimental')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
