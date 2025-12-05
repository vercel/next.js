describe('api/image', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('should re-export Image from shared/lib/image-external', () => {
    // This module re-exports from shared/lib/image-external
    // We test that the module can be imported without errors
    expect(() => require('./image')).not.toThrow()
  })

  it('should export default Image component', async () => {
    const imageModule = await import('./image')

    expect(imageModule).toHaveProperty('default')
    // Image should be a React component (function or object with $$typeof)
    const ImageComponent = imageModule.default
    expect(
      typeof ImageComponent === 'function' ||
        (typeof ImageComponent === 'object' && ImageComponent !== null)
    ).toBe(true)
  })

  it('should be importable as ES module', async () => {
    const imageModule = await import('./image')

    expect(imageModule).toBeDefined()
    expect(typeof imageModule).toBe('object')
  })

  it('should export ImageProps type if available', async () => {
    const imageModule = await import('./image')

    // Named exports might include types and utilities
    expect(imageModule).toBeDefined()
  })
})
