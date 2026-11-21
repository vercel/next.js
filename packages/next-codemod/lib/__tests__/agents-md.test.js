/* global jest */
jest.autoMockOff()

const fs = require('fs')
const path = require('path')
const os = require('os')
const { extractVersionFromRange, getNextjsVersion } = require('../agents-md')

describe('extractVersionFromRange', () => {
  it('handles caret ranges', () => {
    expect(extractVersionFromRange('^16.1.3')).toBe('16.1.3')
    expect(extractVersionFromRange('^15.0.0')).toBe('15.0.0')
  })

  it('handles tilde ranges', () => {
    expect(extractVersionFromRange('~16.1.0')).toBe('16.1.0')
  })

  it('handles exact versions', () => {
    expect(extractVersionFromRange('16.1.3')).toBe('16.1.3')
  })

  it('handles bare major versions', () => {
    expect(extractVersionFromRange('^16')).toBe('16.0.0')
    expect(extractVersionFromRange('16')).toBe('16.0.0')
  })

  it('handles major.minor versions', () => {
    expect(extractVersionFromRange('~16.1')).toBe('16.1.0')
  })

  it('handles pre-release versions', () => {
    expect(extractVersionFromRange('^16.2.0-canary.16')).toBe(
      '16.2.0-canary.16'
    )
  })

  it('handles gte ranges', () => {
    expect(extractVersionFromRange('>=15.0.0')).toBe('15.0.0')
  })

  it('returns null for invalid input', () => {
    expect(extractVersionFromRange('latest')).toBeNull()
    expect(extractVersionFromRange('*')).toBeNull()
  })
})

describe('getNextjsVersion', () => {
  const fixturesDir = path.join(__dirname, 'fixtures/agents-md')

  it('returns the installed version from node_modules', () => {
    const fixture = path.join(fixturesDir, 'next-specific-version')
    const result = getNextjsVersion(fixture)

    expect(result.version).toBe('15.4.0')
    expect(result.error).toBeUndefined()
  })

  it('returns actual installed version, not the tag from package.json', () => {
    const fixture = path.join(fixturesDir, 'next-tag')
    const result = getNextjsVersion(fixture)

    expect(result.version).toBe('16.0.0')
    expect(result.error).toBeUndefined()
  })

  it('returns error when next is not installed and no package.json exists', () => {
    const tempDir = path.join(
      os.tmpdir(),
      `agents-md-empty-${Date.now()}`
    )
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      const result = getNextjsVersion(tempDir)
      expect(result.version).toBeNull()
      expect(result.error).toBeDefined()
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('falls back to package.json when next is not installed', () => {
    const tempDir = path.join(
      os.tmpdir(),
      `agents-md-fallback-${Date.now()}`
    )
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test',
          dependencies: { next: '^16.1.3' },
        })
      )

      const result = getNextjsVersion(tempDir)
      expect(result.version).toBe('16.1.3')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('handles bare major version in package.json fallback', () => {
    const tempDir = path.join(
      os.tmpdir(),
      `agents-md-major-${Date.now()}`
    )
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test',
          devDependencies: { next: '^16' },
        })
      )

      const result = getNextjsVersion(tempDir)
      expect(result.version).toBe('16.0.0')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
