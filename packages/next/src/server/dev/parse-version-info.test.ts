import { parseVersionInfo } from './parse-version-info'
import type { VersionInfo } from './parse-version-info'

describe('parse version info', () => {
  test.each<
    [
      installed: string,
      latest: string,
      canary: string,
      staleness: VersionInfo['staleness'],
    ]
  >([
    ['12.0.0', '13.1.1', '13.0.1-canary.0', 'stale-major'],
    ['13.0.0', '13.1.0', '13.1.1-canary.0', 'stale-minor'],
    ['13.1.1', '13.1.2', '13.1.3-canary.0', 'stale-patch'],
    ['13.0.1-canary.0', '13.0.0', '13.0.1-canary.1', 'stale-prerelease'],
    ['13.0.1-canary.0', '13.0.0', '13.1.0-canary.0', 'stale-prerelease'],
    ['13.1.0', '13.1.0', '13.1.1-canary.0', 'fresh'],
    ['13.1.1-canary.7', '13.1.0', '13.1.1-canary.7', 'fresh'],
    ['13.0.0', '12.0.0', '12.0.1-canary.0', 'newer-than-npm'],
    ['13.0.1-canary.8', '13.0.0', '13.0.1-canary.7', 'newer-than-npm'],
    ['13.0.0', '13.1.0', 'invalid', 'unknown'],
    ['13.0.0', 'invalid', '13.0.1-canary.0', 'unknown'],
    ['invalid', '13.0.1', '13.0.1-canary.0', 'unknown'],
  ])(
    'installed: %s, latest: %s, canary: %s yields %s',
    (installed, latest, canary, expected) => {
      expect(parseVersionInfo({ installed, latest, canary }).staleness).toBe(
        expected
      )
    }
  )
})
