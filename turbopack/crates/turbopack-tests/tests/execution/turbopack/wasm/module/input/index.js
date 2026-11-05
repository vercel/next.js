const wasm = require('./add.wasm?module')

it('should not instantiate wasm modules when the `module` query param is passed', async () => {
  // add.wasm is loaded as an async module, so we require it and await inside this function to make sure the entrypoint isn't async.
  const m = await wasm

  expect(m.default).toBeInstanceOf(WebAssembly.Module)
})

it('should keep a `module` import apart from an instantiating import of the same file', async () => {
  const [compiled, instantiated] = await Promise.all([
    wasm,
    require('./add.wasm'),
  ])

  expect(compiled.default).toBeInstanceOf(WebAssembly.Module)
  expect(instantiated.add(1, 2)).toEqual(3)
})
