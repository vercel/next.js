import { esmValue } from './esm-mod'
const cjs = require('./cjs-mod')

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter(
    (id) =>
      id.split(' ')[0].endsWith(`/input/${file}`) && !id.includes('loader)')
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('keeps sloppy mode for CommonJS modules minified before chunking', () => {
  expect(esmValue).toBe(2)
  expect(cjs.cjsValue).toBe(0o777)

  expect(moduleCode('esm-mod.js')).toContain('"use strict"')
  expect(moduleCode('cjs-mod.js')).not.toContain('"use strict"')
})
