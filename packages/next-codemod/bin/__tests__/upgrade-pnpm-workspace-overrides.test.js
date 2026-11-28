/* global jest */
jest.autoMockOff()

const fs = require('fs')
const os = require('os')
const path = require('path')
const { parse } = require('yaml')
const { writePnpmWorkspaceOverrides } = require('../upgrade')

const fixtureDir = path.join(
  __dirname,
  '../__testfixtures__/pnpm-v11-workspace-overrides'
)
const overrides = { '@types/react': '19.0.0', '@types/react-dom': '19.0.0' }

describe('upgrade: pnpm v11 overrides in a workspace', () => {
  let workspaceDir
  let appDir
  let appName
  let originalConsoleLog
  let consoleOutput

  const readRootManifest = () =>
    fs.readFileSync(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8')

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(
      path.join(
        process.env.NEXT_TEST_DIR || os.tmpdir(),
        'pnpm-workspace-overrides-'
      )
    )
    fs.cpSync(fixtureDir, workspaceDir, { recursive: true })
    appDir = path.join(workspaceDir, 'apps', 'web')
    appName = JSON.parse(
      fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')
    ).name

    originalConsoleLog = console.log
    consoleOutput = []
    console.log = (...args) => {
      consoleOutput.push(args.join(' '))
    }
  })

  afterEach(() => {
    console.log = originalConsoleLog
    jest.restoreAllMocks()
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  it('writes to the workspace root and does not create a nested pnpm-workspace.yaml', () => {
    writePnpmWorkspaceOverrides(overrides, appName, appDir)

    expect(fs.existsSync(path.join(appDir, 'pnpm-workspace.yaml'))).toBe(false)
    expect(parse(readRootManifest()).overrides).toBeDefined()
  })

  it("scopes the overrides to the app's package name", () => {
    writePnpmWorkspaceOverrides(overrides, appName, appDir)

    expect(parse(readRootManifest()).overrides).toEqual({
      '@fixture/web>@types/react': '19.0.0',
      '@fixture/web>@types/react-dom': '19.0.0',
    })
  })

  it('falls back to unscoped overrides and warns when the app has no name', () => {
    writePnpmWorkspaceOverrides(overrides, undefined, appDir)

    expect(parse(readRootManifest()).overrides).toEqual(overrides)
    expect(consoleOutput.join('\n')).toContain(
      `The package.json at "${appDir}" has no "name"`
    )
  })

  it('does not rewrite the manifest when the overrides already match', () => {
    writePnpmWorkspaceOverrides(overrides, appName, appDir)
    const writeFileSync = jest.spyOn(fs, 'writeFileSync')
    consoleOutput = []

    writePnpmWorkspaceOverrides(overrides, appName, appDir)

    expect(writeFileSync).not.toHaveBeenCalled()
    expect(consoleOutput).toEqual([])
  })

  it('preserves comments and formatting in the root pnpm-workspace.yaml', () => {
    writePnpmWorkspaceOverrides(overrides, appName, appDir)

    expect(readRootManifest()).toMatchInlineSnapshot(`
     "# The workspace root. \`apps/web\` must keep resolving \`@fixture/ui\` from here.
     packages:
       - 'apps/*'
       - 'packages/*'

     allowBuilds:
       sharp: false
       unrs-resolver: false
     overrides:
       "@fixture/web>@types/react": 19.0.0
       "@fixture/web>@types/react-dom": 19.0.0
     "
    `)
  })
})
