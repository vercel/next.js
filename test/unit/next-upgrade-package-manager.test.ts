import { execSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPnpmMajorVersion } from '../../packages/next-upgrade/src/utils/package-manager'
import { getNpxCommand } from '../../packages/next-upgrade/src/utils/npx'

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn(),
}))

describe('@next/upgrade package manager detection', () => {
  const originalUserAgent = process.env.npm_config_user_agent
  let directory: string

  beforeEach(() => {
    jest.mocked(execSync).mockReset()
    directory = mkdtempSync(join(tmpdir(), 'next-upgrade-package-manager-'))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
    if (originalUserAgent === undefined) {
      delete process.env.npm_config_user_agent
    } else {
      process.env.npm_config_user_agent = originalUserAgent
    }
  })

  it('reads the pnpm version selected by the target app', () => {
    // The launcher may run from a workspace root with another pnpm version.
    process.env.npm_config_user_agent = 'pnpm/10.34.5 npm/? node/v24.0.0'
    jest.mocked(execSync).mockReturnValue('11.5.3\n')

    expect(getPnpmMajorVersion(directory)).toBe(11)
    expect(execSync).toHaveBeenCalledWith('pnpm --version', {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
  })

  it('falls back to the launcher version', () => {
    process.env.npm_config_user_agent = 'pnpm/10.34.5 npm/? node/v24.0.0'
    jest.mocked(execSync).mockImplementation(() => {
      throw new Error('pnpm is unavailable')
    })

    expect(getPnpmMajorVersion(directory)).toBe(10)
  })

  it("runs packages with the target app's declared package manager", () => {
    process.env.npm_config_user_agent = 'npm/10.9.0 node/v24.0.0'
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@11.5.3' })
    )

    expect(getNpxCommand(directory)).toBe('pnpm --loglevel=error dlx')
    expect(execSync).not.toHaveBeenCalled()
  })
})
