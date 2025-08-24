const magicAsyncModule = require('./magic')

describe('complex wasm', () => {
  it('should be possible to use imported memory', async () => {
    // magic.js is an async module, so we require it and await inside this function to make sure the entrypoint isn't async.
    const { get, set } = await magicAsyncModule

    set(42)
    expect(get()).toEqual(42)
    set(123)
    expect(get()).toEqual(123)
  })

  it('should be possible to use imported functions', async () => {
    // magic.js is an async module, so we require it and await inside this function to make sure the entrypoint isn't async.
    const { getNumber } = await magicAsyncModule

    // random numbers
    expect(getNumber()).toBeGreaterThanOrEqual(0)
    expect(getNumber()).toBeGreaterThanOrEqual(0)
  })
})
