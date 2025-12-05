describe('api/link', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('should re-export Link from shared/lib/link', () => {
    // This module re-exports Link component
    // We test that the module can be imported without errors
    expect(() => require('./link')).not.toThrow()
  })

  it('should export default Link component', async () => {
    const linkModule = await import('./link')

    expect(linkModule).toHaveProperty('default')
    // Link should be a React component
    const LinkComponent = linkModule.default
    expect(
      typeof LinkComponent === 'function' ||
        (typeof LinkComponent === 'object' && LinkComponent !== null)
    ).toBe(true)
  })

  it('should be importable as ES module', async () => {
    const linkModule = await import('./link')

    expect(linkModule).toBeDefined()
    expect(typeof linkModule).toBe('object')
  })
})
