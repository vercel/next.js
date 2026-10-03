import foo from 'foo/plugin'

it("shouldn't try to resolve TS file in node_modules", () => {
  expect(foo).toBe('this is plugin.js')
})
