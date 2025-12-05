describe('api/dynamic', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('should re-export dynamic from shared/lib/dynamic', () => {
    // This module re-exports from shared/lib/dynamic
    // We test that the module can be imported without errors
    expect(() => require('./dynamic')).not.toThrow()
  })

  it('should export default function', async () => {
    const dynamicModule = await import('./dynamic')

    expect(dynamicModule).toHaveProperty('default')
    expect(typeof dynamicModule.default).toBe('function')
  })

  it('should be callable as ES module', async () => {
    const dynamicModule = await import('./dynamic')

    // dynamic() should be a function that can be called
    expect(typeof dynamicModule.default).toBe('function')
  })

  it('should export named exports from dynamic', async () => {
    const dynamicModule = await import('./dynamic')

    // The module might export additional utilities
    expect(dynamicModule).toBeDefined()
    expect(typeof dynamicModule).toBe('object')
  })
})
