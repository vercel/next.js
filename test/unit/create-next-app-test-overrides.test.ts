import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  addTestPackageOverrides,
  formatPnpmWorkspaceOverrides,
} from '../../packages/create-next-app/helpers/test-package-overrides'

// create-next-app's own `tar` dependency, used to build fixture tarballs. It
// isn't a root dependency, so resolve it from that package.
const tar = require(
  require.resolve('tar', {
    paths: [path.join(__dirname, '../../packages/create-next-app')],
  })
)

let tmpDir: string

function packTarball(name: string, manifest: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(tmpDir, 'pkg-'))
  fs.mkdirSync(path.join(dir, 'package'))
  fs.writeFileSync(
    path.join(dir, 'package', 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...manifest })
  )
  const file = path.join(dir, 'packed.tgz')
  tar.c({ gzip: true, sync: true, cwd: dir, file }, ['package'])
  return file
}

let testPkgPaths: Map<string, string>

function appPackageJson(): Record<string, any> {
  return {
    name: 'app',
    dependencies: { next: testPkgPaths.get('next'), react: '19.0.0' },
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cna-test-overrides-'))
  testPkgPaths = new Map([
    [
      'next',
      packTarball('next', {
        dependencies: {
          '@next/env': '1.0.0',
          '@next/upgrade': '1.0.0',
          'styled-jsx': '5.0.0',
        },
      }),
    ],
    [
      '@next/upgrade',
      packTarball('@next/upgrade', { dependencies: { '@next/env': '1.0.0' } }),
    ],
    ['@next/env', packTarball('@next/env', {})],
    [
      'eslint-config-next',
      packTarball('eslint-config-next', {
        dependencies: { '@next/eslint-plugin-next': '1.0.0' },
      }),
    ],
    ['@next/eslint-plugin-next', packTarball('@next/eslint-plugin-next', {})],
    [
      '@next/codemod',
      packTarball('@next/codemod', { dependencies: { '@next/env': '1.0.0' } }),
    ],
  ])
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('create-next-app test package overrides', () => {
  it('leaves the app unchanged outside tests', () => {
    const packageJson = appPackageJson()

    expect(addTestPackageOverrides(packageJson, null, 'npm', null)).toBeNull()
    expect(packageJson).toEqual(appPackageJson())
  })

  it.each(['npm', 'bun'] as const)(
    'overrides only reachable packed packages for %s',
    (packageManager) => {
      const packageJson = appPackageJson()

      expect(
        addTestPackageOverrides(packageJson, testPkgPaths, packageManager, null)
      ).toBeNull()
      // Not eslint-config-next, @next/eslint-plugin-next or @next/codemod,
      // which the app doesn't depend on.
      expect(packageJson.overrides).toEqual({
        '@next/env': testPkgPaths.get('@next/env'),
        '@next/upgrade': testPkgPaths.get('@next/upgrade'),
      })
    }
  )

  it('adds resolutions for yarn', () => {
    const packageJson = appPackageJson()

    expect(
      addTestPackageOverrides(packageJson, testPkgPaths, 'yarn', null)
    ).toBeNull()
    expect(Object.keys(packageJson.resolutions)).toEqual([
      '@next/env',
      '@next/upgrade',
    ])
    expect(packageJson.overrides).toBeUndefined()
  })

  it.each([9, 10])('adds pnpm.overrides for pnpm v%s', (major) => {
    const packageJson = appPackageJson()

    expect(
      addTestPackageOverrides(packageJson, testPkgPaths, 'pnpm', major)
    ).toBeNull()
    expect(Object.keys(packageJson.pnpm.overrides)).toEqual([
      '@next/env',
      '@next/upgrade',
    ])
  })

  it.each([11, null])(
    'returns pnpm-workspace.yaml overrides for pnpm %s',
    (major) => {
      const packageJson = appPackageJson()

      expect(
        addTestPackageOverrides(packageJson, testPkgPaths, 'pnpm', major)
      ).toEqual({
        '@next/env': testPkgPaths.get('@next/env'),
        '@next/upgrade': testPkgPaths.get('@next/upgrade'),
      })
      expect(packageJson).toEqual(appPackageJson())
    }
  )

  it('includes dependencies of an explicitly selected packed package', () => {
    const packageJson = appPackageJson()
    packageJson.devDependencies = {
      'eslint-config-next': testPkgPaths.get('eslint-config-next'),
    }

    addTestPackageOverrides(packageJson, testPkgPaths, 'npm', null)

    expect(Object.keys(packageJson.overrides)).toEqual([
      '@next/env',
      '@next/eslint-plugin-next',
      '@next/upgrade',
    ])
  })

  it('follows optional dependencies and handles cycles', () => {
    const paths = new Map([
      [
        'next',
        packTarball('next', { optionalDependencies: { '@next/a': '1.0.0' } }),
      ],
      ['@next/a', packTarball('@next/a', { dependencies: { '@next/b': '1' } })],
      ['@next/b', packTarball('@next/b', { dependencies: { '@next/a': '1' } })],
    ])
    const packageJson: Record<string, any> = {
      dependencies: { next: paths.get('next') },
    }

    addTestPackageOverrides(packageJson, paths, 'npm', null)

    expect(Object.keys(packageJson.overrides)).toEqual(['@next/a', '@next/b'])
  })

  it('does not override direct dependencies', () => {
    const packageJson = appPackageJson()
    packageJson.dependencies['@next/env'] = testPkgPaths.get('@next/env')

    addTestPackageOverrides(packageJson, testPkgPaths, 'npm', null)

    expect(packageJson.overrides).toEqual({
      '@next/upgrade': testPkgPaths.get('@next/upgrade'),
    })
  })

  it('adds nothing when no packed package is reachable', () => {
    const packageJson: Record<string, any> = {
      dependencies: { react: '19.0.0' },
    }

    expect(
      addTestPackageOverrides(packageJson, testPkgPaths, 'npm', null)
    ).toBeNull()
    expect(packageJson).toEqual({ dependencies: { react: '19.0.0' } })
  })

  it('fails clearly when a packed tarball cannot be read', () => {
    const missing = path.join(tmpDir, 'missing.tgz')
    testPkgPaths.set('@next/upgrade', missing)

    expect(() =>
      addTestPackageOverrides(appPackageJson(), testPkgPaths, 'npm', null)
    ).toThrow(missing)
  })

  it('formats pnpm-workspace.yaml overrides', () => {
    expect(
      formatPnpmWorkspaceOverrides(
        {
          '@next/env': '/repo/packages/next-env/packed.tgz',
          '@next/upgrade': '/repo/packages/next-upgrade/packed.tgz',
        },
        '\n'
      )
    ).toBe(
      [
        'overrides:',
        '  "@next/env": "/repo/packages/next-env/packed.tgz"',
        '  "@next/upgrade": "/repo/packages/next-upgrade/packed.tgz"',
        '',
      ].join('\n')
    )
  })
})
