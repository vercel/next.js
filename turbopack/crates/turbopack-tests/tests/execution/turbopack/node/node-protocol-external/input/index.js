import fs from 'node:fs'

it('treats node: builtins as externals', () => {
  expect(typeof fs.readFileSync).toBe('function')

  const ids = Array.from(__turbopack_modules__.keys()).filter((id) =>
    id.endsWith('/input/index.js [test] (ecmascript)')
  )
  expect(ids).toHaveLength(1)
  expect(__turbopack_modules__.get(ids[0]).toString()).toContain(
    'require("node:fs")'
  )
})
