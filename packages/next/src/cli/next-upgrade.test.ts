import { EventEmitter } from 'node:events'
import { spawn } from 'child_process'
import { spawnNextUpgrade } from './next-upgrade'
import { getProjectDir } from '../lib/get-project-dir'
import { getPkgManager } from '../lib/helpers/get-pkg-manager'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import {
  getAgeGatedPackage,
  resolveAgeEligibleVersion,
} from '../lib/helpers/get-minimum-release-age'

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}))
jest.mock('../lib/get-project-dir', () => ({ getProjectDir: jest.fn() }))
jest.mock('../lib/helpers/get-pkg-manager', () => ({
  getPkgManager: jest.fn(),
}))
jest.mock('../lib/helpers/get-npx-command', () => ({
  getNpxCommand: jest.fn(),
}))
jest.mock('../lib/helpers/get-minimum-release-age', () => ({
  getAgeGatedPackage: jest.fn(),
  resolveAgeEligibleVersion: jest.fn(),
}))

describe('next upgrade minimum release age', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getProjectDir).mockReturnValue('/app')
    jest.mocked(getPkgManager).mockReturnValue('pnpm')
    jest.mocked(getNpxCommand).mockReturnValue('pnpm dlx')
    jest
      .mocked(getAgeGatedPackage)
      .mockImplementation((directory, manager, name) => ({
        name,
        minimumReleaseAge: 48 * 60 * 60 * 1000,
        exclusions: [],
        registry: 'https://registry.npmjs.org/',
        directory,
        manager,
      }))
    jest.mocked(resolveAgeEligibleVersion).mockResolvedValue('17.0.0-canary.35')
    jest.mocked(spawn).mockReturnValue(new EventEmitter() as never)
  })

  it('uses a shared eligible stable release for ordinary upgrades', async () => {
    jest.mocked(resolveAgeEligibleVersion).mockResolvedValue('16.1.2')
    await spawnNextUpgrade(undefined, {
      revision: 'latest',
      verbose: false,
      ai: false,
    })

    expect(resolveAgeEligibleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'next' }),
      'latest',
      expect.objectContaining({ name: '@next/codemod' })
    )
    expect(spawn).toHaveBeenCalledWith(
      'pnpm',
      ['dlx', '@next/codemod@16.1.2', 'upgrade', '16.1.2'],
      { stdio: 'inherit', cwd: '/app' }
    )
  })

  it('uses the shared eligible canary for the codemod and Next.js', async () => {
    await spawnNextUpgrade(undefined, {
      revision: 'canary',
      verbose: false,
      ai: false,
    })

    expect(resolveAgeEligibleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'next' }),
      'canary',
      expect.objectContaining({ name: '@next/codemod' })
    )
    expect(spawn).toHaveBeenCalledWith(
      'pnpm',
      ['dlx', '@next/codemod@17.0.0-canary.35', 'upgrade', '17.0.0-canary.35'],
      { stdio: 'inherit', cwd: '/app' }
    )
  })

  it('passes custom dist-tags to the age resolver', async () => {
    jest.mocked(resolveAgeEligibleVersion).mockResolvedValue('15.5.1')
    await spawnNextUpgrade(undefined, {
      revision: 'next-15',
      verbose: false,
      ai: false,
    })
    expect(resolveAgeEligibleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'next', range: 'next-15' }),
      'latest',
      expect.objectContaining({ name: '@next/codemod' })
    )
    expect(spawn).toHaveBeenCalledWith(
      'pnpm',
      ['dlx', '@next/codemod@15.5.1', 'upgrade', '15.5.1'],
      { stdio: 'inherit', cwd: '/app' }
    )
  })
})
