import {
  warnOptionHasBeenMovedOutOfExperimental,
  warnOptionHasBeenDeprecated,
} from 'next/dist/server/config'
import stripAnsi from 'strip-ansi'

describe('warnOptionHasBeenMovedOutOfExperimental', () => {
  let spy: jest.SpyInstance
  beforeAll(() => {
    spy = jest.spyOn(console, 'warn').mockImplementation((...args) => {
      const [prefix, ...restArgs] = args
      const formattedFirstArg = stripAnsi(prefix)
      // pass the rest of the arguments to the spied console.warn
      // @ts-expect-error accessing the mocked console.warn
      console.warn.mock.calls.push([formattedFirstArg, ...restArgs])
    })
  })

  it('should not log warning message without experimental config', () => {
    warnOptionHasBeenMovedOutOfExperimental(
      {},
      'skipTrailingSlashRedirect',
      'skipTrailingSlashRedirect',
      'next.config.js',
      false
    )

    warnOptionHasBeenMovedOutOfExperimental(
      {
        experimental: {},
      },
      'skipTrailingSlashRedirect',
      'skipTrailingSlashRedirect',
      'next.config.js',
      false
    )

    expect(spy).not.toHaveBeenCalled()
  })

  it('should log warning message with removed experimental config', () => {
    warnOptionHasBeenMovedOutOfExperimental(
      {
        experimental: {
          skipTrailingSlashRedirect: true,
        },
      } as any,
      'skipTrailingSlashRedirect',
      'skipTrailingSlashRedirect',
      'next.config.js',
      false
    )

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        '⚠ `experimental.skipTrailingSlashRedirect` has been moved to `skipTrailingSlashRedirect`. Please update your next.config.js file accordingly.'
      )
    )
  })

  it('should log warning message with removed experimental config - complex key', () => {
    warnOptionHasBeenMovedOutOfExperimental(
      {
        experimental: {
          relay: true,
        },
      } as any,
      'relay',
      'compiler.relay',
      'next.config.js',
      false
    )

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        '⚠ `experimental.relay` has been moved to `compiler.relay`. Please update your next.config.js file accordingly.'
      )
    )
  })

  it('should update removed experimental config into new config', () => {
    const config = {
      experimental: {
        skipTrailingSlashRedirect: true,
      },
    } as any
    warnOptionHasBeenMovedOutOfExperimental(
      config,
      'skipTrailingSlashRedirect',
      'skipTrailingSlashRedirect',
      'next.config.js',
      false
    )

    expect(config.experimental.skipTrailingSlashRedirect).toBe(true)
    expect(config.skipTrailingSlashRedirect).toBe(true)
  })

  it('should update removed experimental config into new config - complex key', () => {
    const config = {
      experimental: {
        foo: 'bar',
      },
    } as any
    warnOptionHasBeenMovedOutOfExperimental(
      config,
      'foo',
      'deep.prop.baz',
      'next.config.js',
      false
    )

    expect(config.experimental.foo).toBe('bar')
    expect(config.deep.prop.baz).toBe('bar')
  })

  it('should show the new key name in the warning', () => {
    const config = {
      experimental: {
        bundlePagesExternals: true,
      },
    } as any

    warnOptionHasBeenMovedOutOfExperimental(
      config,
      'bundlePagesExternals',
      'bundlePagesRouterDependencies',
      'next.config.js',
      false
    )

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        '⚠ `experimental.bundlePagesExternals` has been moved to `bundlePagesRouterDependencies`. Please update your next.config.js file accordingly.'
      )
    )
  })

  // Promoting an option from the `experimental` stage to the `future` stage is
  // just a move to a nested key, which this helper already supports. No
  // `future`-specific helper is needed.
  it('should move an option into `future`', () => {
    const config = {
      experimental: {
        someOption: 'value',
      },
    } as any

    warnOptionHasBeenMovedOutOfExperimental(
      config,
      'someOption',
      'future.someOption',
      'next.config.js',
      false
    )

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        '⚠ `experimental.someOption` has been moved to `future.someOption`. Please update your next.config.js file accordingly.'
      )
    )
    // `config.future` is created on demand.
    expect(config.future).toEqual({ someOption: 'value' })
  })

  it('should move an option into an existing `future` config', () => {
    const config = {
      experimental: { someOption: 'value' },
      future: { otherOption: true },
    } as any

    warnOptionHasBeenMovedOutOfExperimental(
      config,
      'someOption',
      'future.renamedOption',
      'next.config.js',
      false
    )

    expect(config.future).toEqual({
      otherOption: true,
      renamedOption: 'value',
    })
  })
})

describe('warnOptionHasBeenDeprecated', () => {
  let spy: jest.SpyInstance
  beforeAll(() => {
    spy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('should warn experimental.appDir has been deprecated', () => {
    const config = {
      experimental: {
        appDir: true,
      },
    } as any
    warnOptionHasBeenDeprecated(
      config,
      'experimental.appDir',
      'experimental.appDir has been removed',
      false
    )
    expect(spy).toHaveBeenCalled()
  })
})
