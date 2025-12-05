describe('api/navigation', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('should re-export navigation from client/components/navigation', () => {
    // This module re-exports from client/components/navigation
    // We test that the module can be imported without errors
    expect(() => require('./navigation')).not.toThrow()
  })

  it('should be importable as ES module', async () => {
    const navigationModule = await import('./navigation')

    expect(navigationModule).toBeDefined()
    expect(typeof navigationModule).toBe('object')
  })

  it('should export navigation hooks', async () => {
    const navigationModule = await import('./navigation')

    // Common navigation exports
    // These might include useRouter, usePathname, useSearchParams, etc.
    expect(navigationModule).toHaveProperty('useRouter')
    expect(navigationModule).toHaveProperty('usePathname')
    expect(navigationModule).toHaveProperty('useSearchParams')
  })

  it('should export router navigation functions', async () => {
    const navigationModule = await import('./navigation')

    // Navigation also exports redirect and other functions
    expect(navigationModule).toHaveProperty('redirect')
    expect(navigationModule).toHaveProperty('permanentRedirect')
    expect(navigationModule).toHaveProperty('notFound')
  })

  it('should export useParams hook', async () => {
    const navigationModule = await import('./navigation')

    expect(navigationModule).toHaveProperty('useParams')
  })

  it('should export useSelectedLayoutSegment hook', async () => {
    const navigationModule = await import('./navigation')

    expect(navigationModule).toHaveProperty('useSelectedLayoutSegment')
    expect(navigationModule).toHaveProperty('useSelectedLayoutSegments')
  })
})
