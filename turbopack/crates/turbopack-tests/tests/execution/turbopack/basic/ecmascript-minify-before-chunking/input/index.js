import { result } from './main'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter(
    (id) =>
      id.split(' ')[0].endsWith(`/input/${file}`) && !id.includes('loader)')
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('keeps the behavior of code minified before chunking', () => {
  expect(result).toBe(42)
})

it('minifies each module on its own', () => {
  const helper = moduleCode('helper.js')
  expect(helper).toMatch(/return 2\*\w+/)
  expect(helper).not.toContain('doubled')
  const main = moduleCode('main.js')
  expect(main).not.toContain('unusedInEntry')
  expect(main).not.toContain('neverRead')
})
