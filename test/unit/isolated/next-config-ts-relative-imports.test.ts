/* eslint-env jest */
import { spawnSync } from 'child_process'
import { join } from 'path'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'

const resolveData = join(__dirname, '_resolvedata')
const configDir = join(resolveData, 'typescript-config-relative-import')

// A child process ensures the SWC require hook is exercised in a real Node.js process.
function loadConfigFrom(cwd: string) {
  const script = `
    const loadConfig = require(${JSON.stringify(
      require.resolve('next/dist/server/config')
    )}).default
    loadConfig(${JSON.stringify(PHASE_PRODUCTION_BUILD)}, ${JSON.stringify(
      configDir
    )}).then(
      (config) => {
        console.log('RESULT=' + JSON.stringify(config.__test__relativeImport))
      },
      (err) => {
        console.error(err)
        process.exit(1)
      }
    )
  `
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    __NEXT_NODE_NATIVE_TS_LOADER_ENABLED: 'false',
  }
  delete env.__NEXT_TEST_MODE

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    env,
    encoding: 'utf8',
  })
  const match = /^RESULT=(.*)$/m.exec(result.stdout)
  return {
    status: result.status,
    stderr: result.stderr,
    value: match ? JSON.parse(match[1]) : undefined,
  }
}

describe('next.config.ts relative imports', () => {
  it('resolves relative imports when cwd is the config directory', () => {
    const result = loadConfigFrom(configDir)
    expect(result.stderr).not.toContain('Cannot find module')
    expect(result.value).toBe('config-dir')
  })

  it('resolves relative imports when cwd is elsewhere', () => {
    const result = loadConfigFrom(resolveData)
    expect(result.stderr).not.toContain('Cannot find module')
    expect(result.value).toBe('config-dir')
  })

  it('does not resolve relative imports from cwd when cwd has a matching file', () => {
    const result = loadConfigFrom(
      join(resolveData, 'typescript-config-relative-import-cwd')
    )
    expect(result.stderr).not.toContain('Cannot find module')
    expect(result.value).toBe('config-dir')
  })
})
