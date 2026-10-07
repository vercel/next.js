import {
  addTestPackageOverrides,
  formatPnpmWorkspaceOverrides,
} from '../../packages/create-next-app/helpers/test-package-overrides'

const testPkgPaths = new Map([
  ['next', '/repo/packages/next/packed.tgz'],
  ['@next/upgrade', '/repo/packages/next-upgrade/packed.tgz'],
  ['@next/env', '/repo/packages/next-env/packed.tgz'],
  ['eslint-config-next', '/repo/packages/eslint-config-next/packed.tgz'],
])

const transitiveOverrides = {
  '@next/env': '/repo/packages/next-env/packed.tgz',
  '@next/upgrade': '/repo/packages/next-upgrade/packed.tgz',
}

function appPackageJson() {
  return {
    name: 'app',
    dependencies: { next: '/repo/packages/next/packed.tgz', react: '19.0.0' },
    devDependencies: {
      'eslint-config-next': '/repo/packages/eslint-config-next/packed.tgz',
    },
  }
}

describe('create-next-app test package overrides', () => {
  it('leaves the app unchanged outside tests', () => {
    const packageJson = appPackageJson()

    expect(addTestPackageOverrides(packageJson, null, 'npm', null)).toBeNull()
    expect(packageJson).toEqual(appPackageJson())
  })

  it.each(['npm', 'bun'] as const)(
    'adds overrides for %s, skipping direct dependencies',
    (packageManager) => {
      const packageJson: Record<string, any> = appPackageJson()

      expect(
        addTestPackageOverrides(packageJson, testPkgPaths, packageManager, null)
      ).toBeNull()
      expect(packageJson.overrides).toEqual(transitiveOverrides)
      expect(Object.keys(packageJson.overrides)).toEqual([
        '@next/env',
        '@next/upgrade',
      ])
    }
  )

  it('adds resolutions for yarn', () => {
    const packageJson: Record<string, any> = appPackageJson()

    expect(
      addTestPackageOverrides(packageJson, testPkgPaths, 'yarn', null)
    ).toBeNull()
    expect(packageJson.resolutions).toEqual(transitiveOverrides)
    expect(packageJson.overrides).toBeUndefined()
  })

  it.each([9, 10])('adds pnpm.overrides for pnpm v%s', (major) => {
    const packageJson: Record<string, any> = appPackageJson()

    expect(
      addTestPackageOverrides(packageJson, testPkgPaths, 'pnpm', major)
    ).toBeNull()
    expect(packageJson.pnpm).toEqual({ overrides: transitiveOverrides })
  })

  it.each([11, null])(
    'returns pnpm-workspace.yaml overrides for pnpm %s',
    (major) => {
      const packageJson: Record<string, any> = appPackageJson()

      expect(
        addTestPackageOverrides(packageJson, testPkgPaths, 'pnpm', major)
      ).toEqual(transitiveOverrides)
      expect(packageJson).toEqual(appPackageJson())
    }
  )

  it('adds nothing when every packed package is a direct dependency', () => {
    const packageJson: Record<string, any> = appPackageJson()

    expect(
      addTestPackageOverrides(
        packageJson,
        new Map([['next', '/repo/packages/next/packed.tgz']]),
        'npm',
        null
      )
    ).toBeNull()
    expect(packageJson).toEqual(appPackageJson())
  })

  it('formats pnpm-workspace.yaml overrides', () => {
    expect(formatPnpmWorkspaceOverrides(transitiveOverrides, '\n')).toBe(
      [
        'overrides:',
        '  "@next/env": "/repo/packages/next-env/packed.tgz"',
        '  "@next/upgrade": "/repo/packages/next-upgrade/packed.tgz"',
        '',
      ].join('\n')
    )
  })
})
