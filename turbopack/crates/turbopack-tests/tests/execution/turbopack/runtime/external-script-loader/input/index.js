it('emulates browser script loading and deduplicates concurrent requests', async () => {
  let calls = 0
  globalThis.__turbopack_test_load_script__ = async (url) => {
    calls++
    expect(url).toBe('https://example.test/remoteEntry.js')
    globalThis.testFederationContainer = { loaded: true }
  }

  try {
    await Promise.all([
      __turbopack_load_script__('https://example.test/remoteEntry.js'),
      __turbopack_load_script__('https://example.test/remoteEntry.js'),
    ])
    await __turbopack_load_script__('https://example.test/remoteEntry.js')

    expect(calls).toBe(1)
    expect(globalThis.testFederationContainer.loaded).toBe(true)
  } finally {
    delete globalThis.__turbopack_test_load_script__
    delete globalThis.testFederationContainer
  }
})
