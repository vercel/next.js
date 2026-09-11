/* eslint-env jest */
import { checkCustomRoutes } from 'next/dist/lib/load-custom-routes'

describe('checkCustomRoutes', () => {
  let errorSpy: jest.SpyInstance
  let exitSpy: jest.SpyInstance

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    }) as any
  })

  afterEach(() => {
    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('should report a validation error, not crash with a TypeError, when a rewrite has basePath: false and a missing destination', () => {
    // Before the fix, this threw an uncaught
    // `TypeError: Cannot read properties of undefined (reading 'startsWith')`
    // instead of reaching the normal "destination is missing" validation path.
    expect(() =>
      checkCustomRoutes([{ source: '/foo', basePath: false } as any], 'rewrite')
    ).toThrow('process.exit called')
    expect(errorSpy.mock.calls.join('\n')).toContain('`destination` is missing')
  })

  it('should report a validation error, not crash with a TypeError, when a rewrite has basePath: false and a non-string destination', () => {
    expect(() =>
      checkCustomRoutes(
        [{ source: '/foo', basePath: false, destination: 1234 } as any],
        'rewrite'
      )
    ).toThrow('process.exit called')
    expect(errorSpy.mock.calls.join('\n')).toContain(
      '`destination` is not a string'
    )
  })

  it('should still flag a rewrite with basePath: false and an internal destination as invalid', () => {
    expect(() =>
      checkCustomRoutes(
        [
          {
            source: '/foo',
            basePath: false,
            destination: '/bar',
          } as any,
        ],
        'rewrite'
      )
    ).toThrow('process.exit called')
    expect(errorSpy.mock.calls.join('\n')).toContain(
      'rewrites urls outside of the basePath'
    )
  })

  it('should allow a rewrite with basePath: false and an external destination', () => {
    checkCustomRoutes(
      [
        {
          source: '/foo',
          basePath: false,
          destination: 'https://example.com/bar',
        } as any,
      ],
      'rewrite'
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
