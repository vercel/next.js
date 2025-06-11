import { __turbopack_module_id__ as id } from './module.js'

it('should support importing __turbopack_module_id__', () => {
  expect(id.endsWith('input/module.js [test] (ecmascript)')).toBe(true)
})
