/* eslint-env jest */
import { createTurbopackSetPublicPath } from 'next/dist/client/turbopack-public-path'

describe('createTurbopackSetPublicPath', () => {
  const originalAssetPrefix = process.env.__NEXT_ASSET_PREFIX
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    if (originalAssetPrefix === undefined) {
      delete process.env.__NEXT_ASSET_PREFIX
    } else {
      process.env.__NEXT_ASSET_PREFIX = originalAssetPrefix
    }
  })

  it('does not warn when the runtime assetPrefix matches the build-time value', () => {
    process.env.__NEXT_ASSET_PREFIX = 'https://cdn.example.com'
    createTurbopackSetPublicPath()('https://cdn.example.com/_next/')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not warn when both build-time and runtime assetPrefix are empty', () => {
    delete process.env.__NEXT_ASSET_PREFIX
    createTurbopackSetPublicPath()('/_next/')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('warns when a runtime assetPrefix is set but none was baked in at build time', () => {
    delete process.env.__NEXT_ASSET_PREFIX
    createTurbopackSetPublicPath()('https://cdn.example.com/_next/')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const message = errorSpy.mock.calls[0][0]
    expect(message).toContain('`assetPrefix`')
    expect(message).toContain('https://cdn.example.com')
    expect(message).toContain('will not hydrate')
  })

  it('warns when the runtime assetPrefix differs from the build-time value', () => {
    process.env.__NEXT_ASSET_PREFIX = 'https://build.example.com'
    createTurbopackSetPublicPath()('https://runtime.example.com/_next/')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const message = errorSpy.mock.calls[0][0]
    expect(message).toContain('https://build.example.com')
    expect(message).toContain('https://runtime.example.com')
  })
})
