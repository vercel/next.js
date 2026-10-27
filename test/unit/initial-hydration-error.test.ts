import { isInitialHydrationConnectionClosed } from '../../packages/next/src/client/initial-hydration-error'

describe('isInitialHydrationConnectionClosed', () => {
  it('recognizes the readable Flight stream error', () => {
    expect(
      isInitialHydrationConnectionClosed(new Error('Connection closed.'))
    ).toBeTrue()
  })

  it('recognizes the initial server data writer connection error', () => {
    expect(
      isInitialHydrationConnectionClosed(
        new Error(
          'The connection to the page was unexpectedly closed, possibly due to loss of Wi-Fi.'
        )
      )
    ).toBeTrue()
  })

  it('recognizes the minified production React error', () => {
    expect(
      isInitialHydrationConnectionClosed(
        new Error('Minified React error #412; visit https://react.dev/errors/412')
      )
    ).toBeTrue()
  })

  it('does not treat unrelated hydration errors as a closed stream', () => {
    expect(
      isInitialHydrationConnectionClosed(
        new Error('Hydration failed because the UI does not match')
      )
    ).toBeFalse()
  })
})
