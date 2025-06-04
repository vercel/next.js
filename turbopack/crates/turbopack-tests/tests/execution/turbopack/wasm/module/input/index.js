const wasm = require('./add.wasm?module')

it('should not instantiate wasm modules when the `module` query param is passed', async () => {
  // add.wasm is loaded as an async module, so we require it and await inside this function to make sure the entrypoint isn't async.
  const m = await wasm

  expect(m.default).toBeInstanceOf(WebAssembly.Module)
})
