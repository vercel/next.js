import type { TestProfile } from '../contracts'

/** No instrumentation dependency is loaded for an ordinary compiler session. */
export function assertIstanbulProfile(profile: TestProfile) {
  if (
    profile.mode !== 'development' ||
    profile.environment !== 'node' ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    profile.route !== undefined ||
    profile.browserClient !== undefined
  )
    throw new Error(
      'Istanbul instrumentation requires isolated development Node JavaScript.'
    )
}
