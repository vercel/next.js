import {
  EVENT_BUILD_FEATURE_USAGE,
  eventBuildFeatureUsageFromTurbopackDiagnostics,
} from './build'

describe('eventBuildFeatureUsageFromTurbopackDiagnostics', () => {
  it('returns empty for empty input', () => {
    expect(eventBuildFeatureUsageFromTurbopackDiagnostics([])).toEqual([])
  })

  it('maps a single diagnostic to one event', () => {
    const events = eventBuildFeatureUsageFromTurbopackDiagnostics([
      { featureName: 'next/image', invocationCount: 3 },
    ])
    expect(events).toEqual([
      {
        eventName: EVENT_BUILD_FEATURE_USAGE,
        payload: { featureName: 'next/image', invocationCount: 3 },
      },
    ])
  })

  it('preserves invocationCount of 0 for disabled boolean flags', () => {
    const events = eventBuildFeatureUsageFromTurbopackDiagnostics([
      { featureName: 'swcRelay', invocationCount: 0 },
    ])
    expect(events).toEqual([
      {
        eventName: EVENT_BUILD_FEATURE_USAGE,
        payload: { featureName: 'swcRelay', invocationCount: 0 },
      },
    ])
  })

  it('passes through multiple distinct diagnostics (already aggregated Rust-side)', () => {
    const events = eventBuildFeatureUsageFromTurbopackDiagnostics([
      { featureName: 'next/image', invocationCount: 2 },
      { featureName: 'next/script', invocationCount: 1 },
    ])
    expect(events).toEqual([
      {
        eventName: EVENT_BUILD_FEATURE_USAGE,
        payload: { featureName: 'next/image', invocationCount: 2 },
      },
      {
        eventName: EVENT_BUILD_FEATURE_USAGE,
        payload: { featureName: 'next/script', invocationCount: 1 },
      },
    ])
  })
})
