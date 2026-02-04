it('polyfills `global` to `globalThis`', () => {
  expect(global).toBe(globalThis)
})
