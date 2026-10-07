import execa from 'execa'
import { runUpgrade } from '../../packages/next-codemod/bin/upgrade'
import { getPkgManager } from '../../packages/next-codemod/lib/handle-package'

jest.mock('../../packages/next-codemod/node_modules/execa', () => jest.fn())
jest.mock('../../packages/next-codemod/lib/handle-package', () => ({
  getPkgManager: jest.fn(),
}))
jest.mock('execa', () =>
  jest.requireMock('../../packages/next-codemod/node_modules/execa')
)

const codemodVersion: string =
  require('../../packages/next-codemod/package.json').version

describe('@next/codemod upgrade', () => {
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getPkgManager).mockReturnValue('npm')
  })

  afterEach(() => {
    process.exitCode = originalExitCode
  })

  it('runs the matching @next/upgrade with the same options', async () => {
    jest.mocked(execa).mockResolvedValue({ exitCode: 0 } as never)

    await runUpgrade('15.0.0', {
      verbose: true,
      yes: true,
      skipAdoption: true,
      skipReactUpgrade: true,
      skipEslintUpgrade: true,
    })

    expect(execa).toHaveBeenCalledWith(
      'npx',
      [
        '--yes',
        `@next/upgrade@${codemodVersion}`,
        '--revision',
        '15.0.0',
        '--verbose',
        '--yes',
        '--skip-adoption',
        '--skip-react-upgrade',
        '--skip-eslint-upgrade',
      ],
      { cwd: process.cwd(), stdio: 'inherit', reject: false }
    )
    expect(process.exitCode).toBe(0)
  })

  it('keeps upgrading to the latest minor release by default', async () => {
    jest.mocked(getPkgManager).mockReturnValue('pnpm')
    jest.mocked(execa).mockResolvedValue({ exitCode: 2 } as never)

    await runUpgrade(undefined, { verbose: false })

    expect(jest.mocked(execa).mock.calls[0].slice(0, 2)).toEqual([
      'pnpm',
      [
        '--silent',
        'dlx',
        `@next/upgrade@${codemodVersion}`,
        '--revision',
        'minor',
      ],
    ])
    expect(process.exitCode).toBe(2)
  })
})
