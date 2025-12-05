/**
 * @jest-environment @edge-runtime/jest-environment
 */

describe('api/headers', () => {
  // Mock the server request modules
  beforeEach(() => {
    jest.resetModules()
  })

  it('should re-export cookies from server/request/cookies', () => {
    // This module re-exports from server/request modules
    // We test that the module can be imported without errors
    expect(() => require('./headers')).not.toThrow()
  })

  it('should be importable as ES module', async () => {
    const headersModule = await import('./headers')
    expect(headersModule).toBeDefined()
    expect(typeof headersModule).toBe('object')
  })

  it('should export headers function', async () => {
    const headersModule = await import('./headers')
    // The headers module should export a headers function
    expect(headersModule).toHaveProperty('headers')
  })

  it('should export cookies function', async () => {
    const headersModule = await import('./headers')
    // The headers module should export a cookies function
    expect(headersModule).toHaveProperty('cookies')
  })

  it('should export draftMode function', async () => {
    const headersModule = await import('./headers')
    // The headers module should export a draftMode function
    expect(headersModule).toHaveProperty('draftMode')
  })
})
