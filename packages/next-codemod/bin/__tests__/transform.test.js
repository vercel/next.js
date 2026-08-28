const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { jscodeshiftExtensions, runTransform } = require('../transform')

describe('transform runner', () => {
  it('includes the JavaScript module config extension', () => {
    expect(jscodeshiftExtensions).toEqual(['tsx', 'ts', 'jsx', 'js', 'mjs'])
  })

  it('transforms next.config.mjs files', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'next-codemod-transform-')
    )
    const configPath = path.join(directory, 'next.config.mjs')

    try {
      fs.writeFileSync(
        configPath,
        "export default { experimental: { turbo: { resolveAlias: { underscore: 'lodash' } } } }"
      )

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
