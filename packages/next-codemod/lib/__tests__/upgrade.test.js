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
    targetVersion = '15.5.24'
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
      if (command.includes('react-dom@18.3.1')) return JSON.stringify({ version: '18.3.1', peerDependencies: { react: '^18.3.1' } })
      if (command.includes('react@18.3.1')) return JSON.stringify({ version: '18.3.1' })
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

  it('installs before selected transforms, preserves React and avoids prompts', async () => {
    await runUpgrade('15.5.24', { verbose: false, yes: true, reactVersion: '18.3.1', turbopack: false, skipCodemod: ['next-async-request-api', 'cache-components-instant-false', 'remove-partial-prefetch'] })
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
    expect(manifest.dependencies.next).toBe('15.5.24')
    expect(manifest.dependencies.react).toBe('18.3.1')
    expect(manifest.dependencies['react-dom']).toBe('18.3.1')
    expect(manifest.scripts.dev).toBe('next dev')
    expect(prompts).not.toHaveBeenCalled()
    expect(install).toHaveBeenCalledTimes(1)
    expect(transform.mock.calls.map(call => call[0])).not.toContain('next-async-request-api')
    for (const order of transform.mock.invocationCallOrder) expect(order).toBeGreaterThan(install.mock.invocationCallOrder[0])
  })
  it('preserves the previous default bundler when opting out of adoption across Next 16', async () => {
    targetVersion = '16.3.3'
    const manifestPath = path.join(directory, 'package.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.scripts = { dev: 'next dev --port 4000', build: 'next build', preview: 'next dev --turbopack' }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    await runUpgrade(targetVersion, { verbose: false, yes: true, reactVersion: '18.3.1', turbopack: false })
    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).scripts).toEqual({
      dev: 'next dev --webpack --port 4000',
      build: 'next build --webpack',
      preview: 'next dev --turbopack',
    })
    expect(prompts).not.toHaveBeenCalled()
  })
  it('rejects invalid options without writing the manifest or installing', async () => {
    const before = fs.readFileSync(path.join(directory, 'package.json'), 'utf8')
    await expect(runUpgrade('15.5.24', { verbose: false, yes: true, skipCodemod: ['unknown'] })).rejects.toThrow('Unknown codemod')
    expect(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).toBe(before)
    expect(install).not.toHaveBeenCalled()
    expect(transform).not.toHaveBeenCalled()
  })
})
