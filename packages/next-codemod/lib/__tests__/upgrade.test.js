const fs = require('fs')
const os = require('os')
const path = require('path')

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), execSync: jest.fn() }))
jest.mock('prompts', () => jest.fn())
jest.mock('../../bin/transform', () => ({ runTransform: jest.fn(async () => {}) }))
jest.mock('../agents-md', () => ({ refreshAgentRulesBlock: jest.fn() }))
jest.mock('../handle-package', () => ({
  ...jest.requireActual('../handle-package'),
  getPkgManager: () => 'npm',
  runInstallation: jest.fn(),
}))

describe('upgrade execution choices', () => {
  const originalCwd = process.cwd()
  let directory
  let runUpgrade
  let install
  let transform
  let prompts
  let targetVersion

  beforeEach(() => {
    targetVersion = '16.3.3'
    jest.resetModules()
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-upgrade-unit-'))
    for (const [name, version] of [['next', '14.2.35'], ['react', '18.3.1'], ['react-dom', '18.3.1']]) {
      fs.mkdirSync(path.join(directory, 'node_modules', name), { recursive: true })
      fs.writeFileSync(path.join(directory, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }))
    }
    fs.mkdirSync(path.join(directory, 'pages'))
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ scripts: { dev: 'next dev' }, dependencies: { next: '14.2.35', react: '18.3.1', 'react-dom': '18.3.1' } }))
    process.chdir(directory)
    const { execSync } = require('child_process')
    execSync.mockImplementation(command => {
      if (command.includes('next@') && command.includes('--field version')) return JSON.stringify(targetVersion)
      if (command.includes('next@')) return JSON.stringify({ version: targetVersion, peerDependencies: { react: '^18.3.1 || ^19.0.0', 'react-dom': '^18.3.1 || ^19.0.0' } })
      if (command.includes('--field version')) return JSON.stringify('19.0.0')
      if (command.includes('react/19/migration-recipe') || command.includes('types-react-codemod@latest')) return ''
      throw new Error(`Unexpected subprocess: ${command}`)
    })
    runUpgrade = require('../../bin/upgrade').runUpgrade
    install = require('../handle-package').runInstallation
    transform = require('../../bin/transform').runTransform
    prompts = require('prompts')
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(originalCwd)
    jest.restoreAllMocks()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('skips adoption but runs required migrations and normal React upgrades', async () => {
    await runUpgrade(targetVersion, { verbose: false, yes: true, skipAdoption: true })
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
    expect(manifest.dependencies.next).toBe(targetVersion)
    expect(manifest.dependencies.react).toBe('19.0.0')
    expect(manifest.dependencies['react-dom']).toBe('19.0.0')
    expect(prompts).not.toHaveBeenCalled()
    expect(install).toHaveBeenCalledTimes(1)
    const selected = transform.mock.calls.map(call => call[0])
    expect(selected).toContain('next-async-request-api')
    expect(selected).not.toContain('cache-components-instant-false')
    expect(selected).not.toContain('remove-partial-prefetch')
    for (const order of transform.mock.invocationCallOrder) expect(order).toBeGreaterThan(install.mock.invocationCallOrder[0])
  })

  it('keeps adoption codemods in the existing default selection', async () => {
    await runUpgrade(targetVersion, { verbose: false, yes: true })
    expect(transform.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      'next-async-request-api',
      'cache-components-instant-false',
      'remove-partial-prefetch',
    ]))
  })
})
