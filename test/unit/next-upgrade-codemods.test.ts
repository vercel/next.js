import semver from 'next/dist/compiled/semver'
import {
  getCodemodsBetween,
  runCodemod,
  UPGRADE_CODEMODS,
} from '../../packages/next-upgrade/src/codemods'
import { runChildProcess } from '../../packages/next-upgrade/src/run-child-process'
import { TRANSFORMER_INQUIRER_CHOICES } from '../../packages/next-codemod/lib/utils'

jest.mock('../../packages/next-upgrade/src/run-child-process', () => ({
  runChildProcess: jest.fn(),
}))
jest.mock('../../packages/next-upgrade/src/utils/npx', () => ({
  getNpxCommand: () => 'pnpm --loglevel=error dlx',
}))

const upgradeVersion: string =
  require('../../packages/next-upgrade/package.json').version

describe('@next/upgrade codemods', () => {
  beforeEach(() => {
    jest.mocked(runChildProcess).mockReset()
  })

  it('applies exactly the transforms @next/codemod provides', () => {
    expect(UPGRADE_CODEMODS.map(({ name }) => name).sort()).toEqual(
      TRANSFORMER_INQUIRER_CHOICES.map(({ value }) => value).sort()
    )
  })

  it('lists the codemods in release order', () => {
    for (let index = 1; index < UPGRADE_CODEMODS.length; index++) {
      expect(
        semver.compare(
          UPGRADE_CODEMODS[index - 1].version,
          UPGRADE_CODEMODS[index].version
        )
      ).toBeLessThanOrEqual(0)
    }
  })

  it.each([
    ['14.3.0', '15.0.0-canary.171', true],
    ['14.3.0', '15.0.0-canary.170', false],
    ['15.0.0-canary.170', '15.0.0-canary.171', true],
    ['15.0.0-canary.171', '15.0.0-canary.172', false],
    ['15.0.0-canary.171', '15.0.0', false],
    ['15.0.0-canary.170', '15.0.0', true],
  ])(
    'selects next-async-request-api from %s to %s: %s',
    (installed, target, applies) => {
      expect(
        getCodemodsBetween(installed, target).some(
          ({ name }) => name === 'next-async-request-api'
        )
      ).toBe(applies)
    }
  )

  it('selects nothing when no codemod is newer than the installed version', () => {
    expect(getCodemodsBetween('99.0.0', '100.0.0')).toEqual([])
  })

  it('runs a transform from the matching @next/codemod release', async () => {
    jest.mocked(runChildProcess).mockResolvedValue(0)

    await runCodemod('next-async-request-api', '/workspace/app', {
      verbose: true,
      nonInteractive: true,
    })

    expect(runChildProcess).toHaveBeenCalledWith(
      'pnpm',
      [
        '--loglevel=error',
        'dlx',
        `@next/codemod@${upgradeVersion}`,
        'next-async-request-api',
        '/workspace/app',
        '--force',
        '--verbose',
        '--yes',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' },
      null
    )
  })

  it('fails the upgrade when a transform fails', async () => {
    jest.mocked(runChildProcess).mockResolvedValue(3)

    await expect(
      runCodemod('new-link', '/workspace/app', {
        verbose: false,
        nonInteractive: false,
      })
    ).rejects.toThrow('The new-link codemod failed with exit code 3.')
    expect(jest.mocked(runChildProcess).mock.calls[0][1]).toEqual([
      '--loglevel=error',
      'dlx',
      `@next/codemod@${upgradeVersion}`,
      'new-link',
      '/workspace/app',
      '--force',
    ])
  })
})
