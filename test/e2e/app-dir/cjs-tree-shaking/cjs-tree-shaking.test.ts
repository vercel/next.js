import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

function readAllJs(dir: string): string {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
    .join('\n')
}

describe('cjs-tree-shaking', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should render used exports from named, object-literal, and transpiled-ESM CommonJS modules', async () => {
    const $ = await next.render$('/')
    // `exports.NAME = …` named export.
    expect($('#named').text()).toBe('cjs_used_sentinel_value')
    // `module.exports = { … }` object literal.
    expect($('#object').text()).toBe('cjs_obj_used_sentinel_value')
    // `exports.__esModule = true` interop: the default import resolves to
    // `exports.default`, not the whole exports object.
    expect($('#default').text()).toBe('cjs_default_sentinel_value')
    expect($('#esm-named').text()).toBe('cjs_esm_named_sentinel_value')
  })

  if (isNextStart) {
    it('should drop unused CommonJS exports from client chunks', async () => {
      // Scan all client JS under `.next/static` (chunk directory layout varies).
      const chunks = readAllJs(path.join(next.testDir, '.next/static'))
      // Named `exports.foo = …`: used kept, unused dropped.
      expect(chunks).toContain('cjs_used_sentinel_value')
      expect(chunks).not.toContain('cjs_unused_sentinel_value')
      // `module.exports = { … }` object literal: used kept, unused dropped.
      expect(chunks).toContain('cjs_obj_used_sentinel_value')
      expect(chunks).not.toContain('cjs_obj_unused_sentinel_value')
    })
  }
})
