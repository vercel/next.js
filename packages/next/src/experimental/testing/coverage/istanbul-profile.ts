import type { TestProfile } from '../contracts'

/** No instrumentation dependency is loaded for an ordinary compiler session. */
export function assertIstanbulProfile(profile: TestProfile) {
  if (
    !['development', 'production'].includes(profile.mode) ||
    profile.environment !== 'node' ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    profile.route !== undefined ||
    profile.browserClient !== undefined
  )
    throw new Error(
      'Istanbul instrumentation requires isolated development Node JavaScript or production Node JS/MJS.'
    )
}

/** Production admission is independent of the qualified development typed lane. */
export function assertIstanbulSourceExtension(
  profile: TestProfile,
  file: string
) {
  if (
    profile.mode === 'production' &&
    !/\.(?:js|mjs|ts|mts|[jt]sx)$/.test(file)
  )
    throw new Error(
      'Production Istanbul requires ordinary Node JS/MJS sources or qualified TypeScript or intrinsic JSX sources.'
    )
}
