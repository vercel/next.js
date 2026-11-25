import { esmValue, esmIsStrict } from './esm-mod'
const cjs = require('./cjs-mod')

it('keeps sloppy mode for CommonJS modules minified before chunking', () => {
  expect(esmValue).toBe(2)
  expect(cjs.cjsValue).toBe(0o777)

  // Each module keeps its mode although the modules are minified on their own and then combined
  // into chunks.
  expect(esmIsStrict).toBe(true)
  expect(cjs.cjsIsSloppy).toBe(true)
})
