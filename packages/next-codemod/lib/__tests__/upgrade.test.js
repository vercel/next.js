/* global jest, describe, it, expect, beforeEach, afterEach */
jest.autoMockOff()

const fs = require('fs')
const path = require('path')
const os = require('os')

describe('upgrade tool - updatePnpmWorkspaceYaml', () => {
  it('should create overrides block when empty', () => {
    const { updatePnpmWorkspaceYaml } = require('../../bin/upgrade')
    const yaml = ''
    const newOverrides = {
      '@types/react': '19.0.0',
      '@types/react-dom': '19.0.0',
    }
    const result = updatePnpmWorkspaceYaml(yaml, newOverrides)
    expect(result.trim()).toBe(
      `overrides:\n  "@types/react": "19.0.0"\n  "@types/react-dom": "19.0.0"`
    )
  })

  it('should append overrides block to existing yaml without overrides', () => {
    const { updatePnpmWorkspaceYaml } = require('../../bin/upgrade')
    const yaml = 'packages:\n  - "packages/*"\n'
    const newOverrides = {
      '@types/react': '19.0.0',
    }
    const result = updatePnpmWorkspaceYaml(yaml, newOverrides)
    expect(result).toBe(
      `packages:\n  - "packages/*"\n\noverrides:\n  "@types/react": "19.0.0"`
    )
  })

  it('should merge new overrides into existing overrides block', () => {
    const { updatePnpmWorkspaceYaml } = require('../../bin/upgrade')
    const yaml = `packages:
  - "packages/*"

overrides:
  "foo": "1.0.0"
  "@types/react": "18.2.0"
`
    const newOverrides = {
      '@types/react': '19.0.0',
      '@types/react-dom': '19.0.0',
    }
    const result = updatePnpmWorkspaceYaml(yaml, newOverrides)
    expect(result).toBe(`packages:
  - "packages/*"

overrides:
  "foo": "1.0.0"
  "@types/react": "19.0.0"
  "@types/react-dom": "19.0.0"
`)
  })

  it('should preserve comments and formatting inside overrides block', () => {
    const { updatePnpmWorkspaceYaml } = require('../../bin/upgrade')
    const yaml = `overrides:
  # This is a comment
  "foo": "1.0.0"
  @types/react: 18.2.0
`
    const newOverrides = {
      '@types/react': '19.0.0',
    }
    const result = updatePnpmWorkspaceYaml(yaml, newOverrides)
    expect(result).toBe(`overrides:
  # This is a comment
  "foo": "1.0.0"
  "@types/react": "19.0.0"
`)
  })
})

describe('upgrade tool - writeOverridesField', () => {
  let testProjectDir
  let originalCwd

  beforeEach(() => {
    const tmpBase = process.env.NEXT_TEST_DIR || os.tmpdir()
    testProjectDir = path.join(
      tmpBase,
      `upgrade-test-${Date.now()}-${(Math.random() * 1000) | 0}`
    )
    fs.mkdirSync(testProjectDir, { recursive: true })
    originalCwd = process.cwd()
  })

  afterEach(() => {
    // Always restore original cwd before trying to delete the temp folder to prevent EPERM on Windows
    if (originalCwd) {
      process.chdir(originalCwd)
    }
    if (testProjectDir && fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true })
    }
  })

  it('should write pnpm overrides to pnpm-workspace.yaml and preserve package.json', () => {
    delete require.cache[require.resolve('../../bin/upgrade')]
    process.chdir(testProjectDir)
    const { writeOverridesField } = require('../../bin/upgrade')

    const packageJson = {
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
      resolutions: {
        bar: '2.0.0',
      },
    }

    const overrides = {
      '@types/react': '19.0.0',
    }

    writeOverridesField(packageJson, 'pnpm', overrides)

    // Verify package.json is preserved (non-destructive)
    expect(packageJson.pnpm.overrides.foo).toBe('1.0.0')
    expect(packageJson.resolutions.bar).toBe('2.0.0')

    // Verify pnpm-workspace.yaml creation and content
    const workspaceYamlPath = path.join(testProjectDir, 'pnpm-workspace.yaml')
    expect(fs.existsSync(workspaceYamlPath)).toBe(true)
    const yamlContent = fs.readFileSync(workspaceYamlPath, 'utf8')
    expect(yamlContent).toContain('overrides:')
    expect(yamlContent).toContain('"foo": "1.0.0"')
    expect(yamlContent).toContain('"bar": "2.0.0"')
    expect(yamlContent).toContain('"@types/react": "19.0.0"')
  })

  it('should keep npm package.json overrides unchanged', () => {
    delete require.cache[require.resolve('../../bin/upgrade')]
    process.chdir(testProjectDir)
    const { writeOverridesField } = require('../../bin/upgrade')

    const packageJson = {
      overrides: {
        foo: '1.0.0',
      },
    }

    const overrides = {
      '@types/react': '19.0.0',
    }

    writeOverridesField(packageJson, 'npm', overrides)

    expect(packageJson.overrides).toEqual({
      foo: '1.0.0',
      '@types/react': '19.0.0',
    })

    const workspaceYamlPath = path.join(testProjectDir, 'pnpm-workspace.yaml')
    expect(fs.existsSync(workspaceYamlPath)).toBe(false)
  })
})
