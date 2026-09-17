import stripAnsi from 'next/dist/compiled/strip-ansi'
import type { ConfiguredExperimentalFeature } from '../config'
import { logExperimentalInfo } from './app-info-log'

describe('logExperimentalInfo', () => {
  let logSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  function getLoggedLines(): string[] {
    return (
      logSpy.mock.calls
        .map((call) => stripAnsi(String(call[0])))
        // `logExperimentalInfo` always ends with an empty line.
        .filter((line) => line !== '')
    )
  }

  it('logs experimental features under the experiments heading', () => {
    logExperimentalInfo({
      experimentalFeatures: [
        { key: 'cssChunking', value: 'graph' },
        { key: 'useSkewCookie', value: true },
      ] as ConfiguredExperimentalFeature[],
    })

    expect(getLoggedLines()).toEqual([
      '- Experiments (use with caution):',
      '  · cssChunking: "graph"',
      '  ✓ useSkewCookie',
    ])
  })

  it('does not log a future heading when no future feature is configured', () => {
    logExperimentalInfo({
      experimentalFeatures: [
        { key: 'useSkewCookie', value: true },
      ] as ConfiguredExperimentalFeature[],
    })

    expect(getLoggedLines()).not.toContain('- Future features:')
  })

  it('logs future features in their own block', () => {
    logExperimentalInfo({
      experimentalFeatures: [
        { key: 'useSkewCookie', value: true },
        // There is no graduated option yet, so this key is not in
        // `futureSchema` and is reported as invalid.
        { key: 'notAFutureOption', value: true, stage: 'future' },
      ] as unknown as ConfiguredExperimentalFeature[],
    })

    expect(getLoggedLines()).toEqual([
      '- Experiments (use with caution):',
      '  ✓ useSkewCookie',
      '- Future features:',
      '  ? notAFutureOption (invalid future key)',
    ])
  })

  it('logs an invalid experimental key', () => {
    logExperimentalInfo({
      experimentalFeatures: [
        { key: 'notAnExperimentalOption', value: true },
      ] as unknown as ConfiguredExperimentalFeature[],
    })

    expect(getLoggedLines()).toEqual([
      '- Experiments (use with caution):',
      '  ? notAnExperimentalOption (invalid experimental key)',
    ])
  })
})
