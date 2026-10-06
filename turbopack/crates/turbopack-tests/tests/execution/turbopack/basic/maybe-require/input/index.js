globalThis.foobar = (v) => `this is ${v}`
const load = globalThis.foobar || require
const nodeLess = load('missing')

it("doesn't replace alternative with require", () => {
  expect(nodeLess).toBe('this is missing')
})
