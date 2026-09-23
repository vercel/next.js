import { isStableBuild } from './canary-only-config-error'

describe('isStableBuild', () => {
  afterEach(() => {
    delete process.env.__NEXT_VERSION
    delete process.env.__NEXT_TEST_MODE
    delete process.env.NEXT_PRIVATE_LOCAL_DEV
  })

  it.each([
    // A plain release version.
    { version: '16.3.0', expected: true },
    // A numbered preview release published to npm (`next@preview`).
    { version: '16.3.0-preview.10', expected: true },
    // A commit preview tarball (scripts/set-preview-version.js) is built from
    // an arbitrary canary commit and must not be treated as stable.
    { version: '16.4.0-preview-84cee7e6-20260917', expected: false },
    { version: '16.4.0-canary.5', expected: false },
  ])('returns $expected for version $version', ({ version, expected }) => {
    process.env.__NEXT_VERSION = version
    expect(isStableBuild()).toBe(expected)
  })

  it('returns true when no version is set', () => {
    delete process.env.__NEXT_VERSION
    expect(isStableBuild()).toBe(true)
  })

  it('returns false in test mode even with a stable version', () => {
    process.env.__NEXT_VERSION = '16.3.0'
    process.env.__NEXT_TEST_MODE = '1'
    expect(isStableBuild()).toBe(false)
  })

  it('returns false for local dev even with a stable version', () => {
    process.env.__NEXT_VERSION = '16.3.0'
    process.env.NEXT_PRIVATE_LOCAL_DEV = '1'
    expect(isStableBuild()).toBe(false)
  })
})
