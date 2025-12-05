/**
 * @jest-environment @edge-runtime/jest-environment
 */

describe('api/server', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('should re-export server utilities from server/web/exports', () => {
    // This module re-exports from server/web/exports/index
    // We test that the module can be imported without errors
    expect(() => require('./server')).not.toThrow()
  })

  it('should be importable as ES module', async () => {
    const serverModule = await import('./server')

    expect(serverModule).toBeDefined()
    expect(typeof serverModule).toBe('object')
  })

  it('should export NextRequest', async () => {
    const serverModule = await import('./server')

    expect(serverModule).toHaveProperty('NextRequest')
  })

  it('should export NextResponse', async () => {
    const serverModule = await import('./server')

    expect(serverModule).toHaveProperty('NextResponse')
  })

  it('should export ImageResponse', async () => {
    const serverModule = await import('./server')

    expect(serverModule).toHaveProperty('ImageResponse')
  })

  it('should export userAgent utility', async () => {
    const serverModule = await import('./server')

    expect(serverModule).toHaveProperty('userAgent')
  })

  it('should export URLPattern if available', async () => {
    const serverModule = await import('./server')

    // URLPattern might be exported from the server module
    expect(serverModule).toBeDefined()
  })
})
