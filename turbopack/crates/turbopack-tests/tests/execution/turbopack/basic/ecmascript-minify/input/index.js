import { logs } from './main.js'

function moduleCode(file) {
  const ids = Array.from(__turbopack_modules__.keys()).filter(
    (id) =>
      id.split(' ')[0].endsWith(`/input/${file}`) && !id.includes('loader)')
  )
  expect(ids).toHaveLength(1)
  return __turbopack_modules__.get(ids[0]).toString()
}

it('keeps the behavior of minified code', () => {
  expect(logs).toEqual([['Hello, world!', 3, 'Hello'], ['Hello']])
})

it('compresses the code', () => {
  const code = moduleCode('main.js')
  // Constants are inlined and string concatenations are folded.
  expect(code).toContain('"Hello, world!",3,')
  // Built dynamically so this test file itself doesn't contain the names.
  expect(code).not.toContain(['get', 'Message'].join(''))
  expect(code).not.toContain(['in', 'lined'].join(''))
})
