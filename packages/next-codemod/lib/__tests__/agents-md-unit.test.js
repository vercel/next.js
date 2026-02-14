/* global jest */
jest.autoMockOff()

const fs = require('fs')
const path = require('path')
const os = require('os')
const {
  getNextjsVersion,
  derivePackageTag,
  generateClaudeMdIndex,
  buildDocTree,
} = require('../../lib/agents-md')

/**
 * Unit tests for agents-md helpers.
 * These test pure functions without any network/git access.
 */

describe('derivePackageTag', () => {
  it('returns @canary for canary versions', () => {
    expect(derivePackageTag('15.2.0-canary.47')).toBe('@canary')
    expect(derivePackageTag('16.0.0-canary.1')).toBe('@canary')
  })

  it('returns @rc for release candidate versions', () => {
    expect(derivePackageTag('15.2.0-rc.1')).toBe('@rc')
    expect(derivePackageTag('16.0.0-rc.12')).toBe('@rc')
  })

  it('returns @alpha for alpha versions', () => {
    expect(derivePackageTag('1.0.0-alpha.3')).toBe('@alpha')
  })

  it('returns @beta for beta versions', () => {
    expect(derivePackageTag('2.0.0-beta.5')).toBe('@beta')
  })

  it('returns empty string for stable versions', () => {
    expect(derivePackageTag('15.2.0')).toBe('')
    expect(derivePackageTag('14.1.3')).toBe('')
    expect(derivePackageTag('1.0.0')).toBe('')
  })

  it('returns empty string for versions with non-matching prerelease tags', () => {
    expect(derivePackageTag('15.2.0-dev.1')).toBe('')
    expect(derivePackageTag('15.2.0-nightly.1')).toBe('')
  })
})

describe('generateClaudeMdIndex with packageTag', () => {
  const fakeSections = buildDocTree([
    { relativePath: 'getting-started/installation.mdx' },
  ])

  it('includes @canary tag in regeneration instruction', () => {
    const result = generateClaudeMdIndex({
      docsPath: './.next-docs',
      sections: fakeSections,
      outputFile: 'AGENTS.md',
      packageTag: '@canary',
    })
    expect(result).toContain(
      'npx @next/codemod@canary agents-md --output AGENTS.md'
    )
  })

  it('includes @rc tag in regeneration instruction', () => {
    const result = generateClaudeMdIndex({
      docsPath: './.next-docs',
      sections: fakeSections,
      outputFile: 'CLAUDE.md',
      packageTag: '@rc',
    })
    expect(result).toContain(
      'npx @next/codemod@rc agents-md --output CLAUDE.md'
    )
  })

  it('omits tag suffix for stable versions', () => {
    const result = generateClaudeMdIndex({
      docsPath: './.next-docs',
      sections: fakeSections,
      outputFile: 'CLAUDE.md',
      packageTag: '',
    })
    expect(result).toContain(
      'npx @next/codemod agents-md --output CLAUDE.md'
    )
    expect(result).not.toContain('@next/codemod@')
  })

  it('omits tag suffix when packageTag is undefined (backwards compat)', () => {
    const result = generateClaudeMdIndex({
      docsPath: './.next-docs',
      sections: fakeSections,
      outputFile: 'AGENTS.md',
    })
    expect(result).toContain(
      'npx @next/codemod agents-md --output AGENTS.md'
    )
    expect(result).not.toContain('@next/codemod@')
  })
})

describe('getNextjsVersion with package-lock.json', () => {
  let testDir

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-version-test-'))
  })

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('prefers package-lock.json version over package.json range (lockfileVersion 3)', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '^14.0.0' },
      })
    )
    fs.writeFileSync(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/next': { version: '14.2.3' },
        },
      })
    )

    const result = getNextjsVersion(testDir)
    expect(result.version).toBe('14.2.3')
  })

  it('prefers package-lock.json version over package.json range (lockfileVersion 1)', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '~13.5.0' },
      })
    )
    fs.writeFileSync(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        dependencies: {
          next: { version: '13.5.6' },
        },
      })
    )

    const result = getNextjsVersion(testDir)
    expect(result.version).toBe('13.5.6')
  })

  it('falls back to package.json when no package-lock.json exists', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '^15.1.0' },
      })
    )

    const result = getNextjsVersion(testDir)
    // Should strip the ^ prefix and return the base version
    expect(result.version).toBe('15.1.0')
  })

  it('falls back to package.json when package-lock.json has no next entry', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '^14.0.0' },
      })
    )
    fs.writeFileSync(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/react': { version: '18.2.0' },
        },
      })
    )

    const result = getNextjsVersion(testDir)
    expect(result.version).toBe('14.0.0')
  })

  it('handles exact version in package.json with matching lock', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '15.0.0' },
      })
    )
    fs.writeFileSync(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/next': { version: '15.0.0' },
        },
      })
    )

    const result = getNextjsVersion(testDir)
    expect(result.version).toBe('15.0.0')
  })

  it('handles canary version in package-lock.json', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '^15.2.0-canary.0' },
      })
    )
    fs.writeFileSync(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/next': { version: '15.2.0-canary.47' },
        },
      })
    )

    const result = getNextjsVersion(testDir)
    expect(result.version).toBe('15.2.0-canary.47')
  })

  it('handles corrupt package-lock.json gracefully', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '^14.0.0' },
      })
    )
    fs.writeFileSync(path.join(testDir, 'package-lock.json'), '{invalid json')

    const result = getNextjsVersion(testDir)
    // Should fall back to package.json
    expect(result.version).toBe('14.0.0')
  })

  it('handles devDependencies with package-lock.json', () => {
    fs.writeFileSync(
      path.join(testDir, 'package.json'),
      JSON.stringify({
        devDependencies: { next: '^14.0.0' },
      })
    )
    fs.writeFileSync(
      path.join(testDir, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/next': { version: '14.2.5' },
        },
      })
    )

    const result = getNextjsVersion(testDir)
    expect(result.version).toBe('14.2.5')
  })
})
