import { resolveEslintUpgradeVersion } from '../resolve-eslint-upgrade'

const peerRange = '>=9.0.0'
const versionsMatchingPeer = ['9.0.0', '9.39.1', '10.0.0', '10.10.0']

describe('resolveEslintUpgradeVersion', () => {
  it('leaves a ^9 specifier alone when eslint-config-next only needs >=9', () => {
    expect(
      resolveEslintUpgradeVersion('^9', peerRange, versionsMatchingPeer)
    ).toBeNull()
  })

  it('leaves a caret-minor 9 specifier alone', () => {
    expect(
      resolveEslintUpgradeVersion('^9.0.0', peerRange, versionsMatchingPeer)
    ).toBeNull()
  })

  it('leaves an exact 9.x pin alone when it already satisfies the peer', () => {
    expect(
      resolveEslintUpgradeVersion('9.39.1', peerRange, versionsMatchingPeer)
    ).toBeNull()
  })

  it('leaves an already-installed ESLint 10 pin alone', () => {
    expect(
      resolveEslintUpgradeVersion('10.10.0', peerRange, versionsMatchingPeer)
    ).toBeNull()
  })

  it('bumps ^8 to the highest release of the lowest satisfying major, not ESLint 10', () => {
    expect(
      resolveEslintUpgradeVersion('^8', peerRange, versionsMatchingPeer)
    ).toBe('9.39.1')
  })

  it('bumps an exact 8.x pin to the highest 9.x', () => {
    expect(
      resolveEslintUpgradeVersion('8.57.1', peerRange, versionsMatchingPeer)
    ).toBe('9.39.1')
  })

  it('leaves an unparseable specifier alone rather than rewriting it', () => {
    expect(
      resolveEslintUpgradeVersion('latest', peerRange, versionsMatchingPeer)
    ).toBeNull()
  })

  it('returns null when npm reported no versions in the peer range', () => {
    expect(resolveEslintUpgradeVersion('^8', peerRange, [])).toBeNull()
  })
})
