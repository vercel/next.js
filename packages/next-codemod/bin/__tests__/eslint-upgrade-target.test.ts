import { resolveEslintUpgradeTarget } from '../shared'

describe('resolveEslintUpgradeTarget', () => {
  const resolveHighestVersion = async (query: string) =>
    `highest-for:${query}`

  it('keeps the installed specifier when it satisfies the peer range', async () => {
    await expect(
      resolveEslintUpgradeTarget('^9.4.0', '>=9', resolveHighestVersion)
    ).resolves.toBe(null)
  })

  it('keeps an exact installed version that satisfies the peer range', async () => {
    await expect(
      resolveEslintUpgradeTarget('10.10.0', '>=9', resolveHighestVersion)
    ).resolves.toBe(null)
  })

  it('keeps a specifier entirely above the peer minimum instead of downgrading', async () => {
    await expect(
      resolveEslintUpgradeTarget('^11', '>=9', resolveHighestVersion)
    ).resolves.toBe(null)
  })

  it('bumps a below-range specifier to the highest release of the lowest satisfying major', async () => {
    await expect(
      resolveEslintUpgradeTarget('^8.7.0', '>=9', resolveHighestVersion)
    ).resolves.toBe('highest-for:eslint@^9.0.0')
  })

  it('bumps a caret-pinned old major to the lowest satisfying major, not the newest eslint', async () => {
    await expect(
      resolveEslintUpgradeTarget('^7', '>=8.0.0 <9 || >=9', resolveHighestVersion)
    ).resolves.toBe('highest-for:eslint@^8.0.0')
  })

  it('leaves specifiers it cannot interpret untouched', async () => {
    await expect(
      resolveEslintUpgradeTarget('latest', '>=9', resolveHighestVersion)
    ).resolves.toBe(null)
  })

  it('leaves the project alone when the peer range is not a valid semver range', async () => {
    await expect(
      resolveEslintUpgradeTarget('^8.7.0', 'not-a-range', resolveHighestVersion)
    ).resolves.toBe(null)
  })
})
