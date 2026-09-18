import {
  assessHumanUpgrade as assess,
  promptHumanUpgrade,
  runHumanUpgrade,
} from 'next/dist/lib/upgrade/human-nudge'
import { getSecurityAdvisory } from 'next/dist/lib/upgrade/prepare-upgrade'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import {
  getUpgradePreferenceKey,
  upgradePreferences,
} from 'next/dist/lib/upgrade/human-preferences'
import { runChildProcess } from 'next/dist/lib/upgrade/run-child-process'
import { execFileSync } from 'child_process'
import { mkdtemp, mkdir, rm, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  getSecurityAdvisory: jest.fn(),
}))
jest.mock('next/dist/telemetry/agent-name', () => ({ getAgentName: jest.fn() }))
jest.mock('next/dist/server/ci-info', () => ({ isCI: false }))
jest.mock('next/dist/lib/upgrade/human-preferences', () => ({
  getUpgradePreferenceKey: jest.fn(),
  upgradePreferences: jest.fn(),
}))
jest.mock('next/dist/lib/upgrade/run-child-process', () => ({
  runChildProcess: jest.fn(),
}))

const dismissed = new Map<string, string>()
const preferences = {
  isDismissed: jest.fn(
    (key: string, kind: string, version: string, policy: string) =>
      dismissed.get(`${key}:${kind}`) === `${version}:${policy}`
  ),
  dismiss: jest.fn(
    (key: string, kind: string, version: string, policy: string) => {
      dismissed.set(`${key}:${kind}`, `${version}:${policy}`)
    }
  ),
}
const ttyIn = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
const ttyOut = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
const setRawMode = Object.getOwnPropertyDescriptor(process.stdin, 'setRawMode')
const originalVersion = process.env.__NEXT_VERSION
let version = '16.0.0'
const assessHumanUpgrade = (
  directory: string,
  context: Parameters<typeof assess>[1]
) => assess(directory, context, version)

beforeEach(() => {
  jest.clearAllMocks()
  dismissed.clear()
  Object.assign(jest.requireMock('next/dist/server/ci-info'), { isCI: false })
  Object.defineProperty(process.stdin, 'isTTY', {
    configurable: true,
    value: true,
  })
  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    value: true,
  })
  Object.defineProperty(process.stdin, 'setRawMode', {
    configurable: true,
    value: jest.fn(),
  })
  process.env.__NEXT_VERSION = '16.0.0'
  version = '16.0.0'
  jest.mocked(getAgentName).mockResolvedValue(null)
  jest
    .mocked(getSecurityAdvisory)
    .mockResolvedValue({ reference: 'https://example.com/advisory' })
  jest.mocked(getUpgradePreferenceKey).mockResolvedValue('app')
  jest.mocked(upgradePreferences).mockReturnValue(preferences)
})

afterEach(() => jest.restoreAllMocks())
afterAll(() => {
  for (const [object, key, descriptor] of [
    [process.stdin, 'isTTY', ttyIn],
    [process.stdout, 'isTTY', ttyOut],
    [process.stdin, 'setRawMode', setRawMode],
  ] as const) {
    if (descriptor) Object.defineProperty(object, key, descriptor)
    else Reflect.deleteProperty(object, key)
  }
  if (originalVersion === undefined) delete process.env.__NEXT_VERSION
  else process.env.__NEXT_VERSION = originalVersion
})

it.each(['disabled', 'unset', 'ci', 'agent', 'stdin', 'stdout'])(
  'does not look up metadata or preferences for %s',
  async (gate) => {
    if (gate === 'ci')
      Object.assign(jest.requireMock('next/dist/server/ci-info'), {
        isCI: true,
      })
    if (gate === 'agent') jest.mocked(getAgentName).mockResolvedValue('codex')
    if (gate === 'stdin' || gate === 'stdout')
      Object.defineProperty(process[gate], 'isTTY', { value: false })
    const policy =
      gate === 'disabled' ? false : gate === 'unset' ? undefined : 'security'
    expect(await assessHumanUpgrade('/app', { policy })).toBeNull()
    expect(getSecurityAdvisory).not.toHaveBeenCalled()
    expect(getUpgradePreferenceKey).not.toHaveBeenCalled()
    expect(upgradePreferences).not.toHaveBeenCalled()
  }
)

it.each(['security', 'latest', 'future'] as const)(
  'offers security upgrades under %s',
  async (policy) => {
    expect(await assessHumanUpgrade('/app', { policy })).toMatchObject({
      kind: 'security',
      policy,
      installedVersion: '16.0.0',
    })
  }
)

it('contains lookup failures', async () => {
  jest.mocked(getSecurityAdvisory).mockRejectedValueOnce(new Error('offline'))
  expect(await assessHumanUpgrade('/app', { policy: 'security' })).toBeNull()
})

it('stays quiet for unaffected versions', async () => {
  jest.mocked(getSecurityAdvisory).mockResolvedValueOnce(null)
  expect(await assessHumanUpgrade('/app', { policy: 'security' })).toBeNull()
})

it('can still prompt if the preference store is unavailable', async () => {
  jest.mocked(upgradePreferences).mockImplementationOnce(() => {
    throw new Error('read only')
  })
  expect(
    await assessHumanUpgrade('/app', { policy: 'security' })
  ).not.toBeNull()
})

async function choose(keys: string[], controller = new AbortController()) {
  const nudge = await assessHumanUpgrade('/app', { policy: 'security' })
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  jest.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin)
  jest.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin)
  const listeners = process.stdin.listenerCount('keypress')
  const selection = promptHumanUpgrade(nudge!, controller.signal)
  for (const name of keys) process.stdin.emit('keypress', '', { name })
  return { selection, controller, listeners }
}

it('cleans terminal handlers on Update now', async () => {
  const { selection, listeners } = await choose(['return'])
  expect(await selection).toBe(true)
  expect(process.stdin.listenerCount('keypress')).toBe(listeners)
  expect(preferences.dismiss).not.toHaveBeenCalled()
})

it.each([['down', 'return'], ['escape']])(
  'skips without persistence: %j',
  async (...keys) => {
    const { selection } = await choose(keys)
    expect(await selection).toBe(false)
    expect(preferences.dismiss).not.toHaveBeenCalled()
  }
)

it('aborts an open menu and releases its listeners', async () => {
  const { selection, controller, listeners } = await choose([])
  controller.abort()
  expect(await selection).toBe(false)
  expect(process.stdin.listenerCount('keypress')).toBe(listeners)
})

it('skips and releases terminal handlers when raw mode fails', async () => {
  jest.mocked(process.stdin.setRawMode).mockImplementation(() => {
    throw new Error('terminal disconnected')
  })
  const { selection, listeners } = await choose([])
  await expect(selection).resolves.toBe(false)
  expect(process.stdin.listenerCount('keypress')).toBe(listeners)
  expect(preferences.dismiss).not.toHaveBeenCalled()
})

it('dismisses across commands until the installed version or policy changes', async () => {
  const { selection } = await choose(['down', 'down', 'return'])
  expect(await selection).toBe(false)
  expect(await assessHumanUpgrade('/app', { policy: 'security' })).toBeNull()
  expect(await assessHumanUpgrade('/app', { policy: 'latest' })).not.toBeNull()
  process.env.__NEXT_VERSION = '16.0.1'
  version = '16.0.1'
  expect(
    await assessHumanUpgrade('/app', { policy: 'security' })
  ).not.toBeNull()
})

it('contains dismissal write failures', async () => {
  preferences.dismiss.mockImplementationOnce(() => {
    throw new Error('read only')
  })
  const { selection } = await choose(['down', 'down', 'return'])
  expect(await selection).toBe(false)
})

it('launches the existing CLI with the configured policy and returns its status', async () => {
  jest.mocked(runChildProcess).mockResolvedValueOnce(23)
  expect(await runHumanUpgrade('/app with spaces', 'future')).toBe(23)
  expect(runChildProcess).toHaveBeenCalledWith(
    process.execPath,
    [expect.any(String), 'upgrade', '/app with spaces', '--ai=future'],
    { cwd: '/app with spaces', stdio: 'inherit' }
  )
})

it('shares identity across Git worktrees but isolates monorepo apps and non-Git directories', async () => {
  const actual = jest.requireActual<
    typeof import('next/dist/lib/upgrade/human-preferences')
  >('next/dist/lib/upgrade/human-preferences')
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'human-upgrade-identity-'))
  )
  const repo = join(root, 'repo')
  const worktree = join(root, 'worktree')
  await mkdir(repo)
  const git = (args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
      { cwd: repo, stdio: 'ignore' }
    )
  try {
    git(['init'])
    git([
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ])
    git(['worktree', 'add', '--detach', worktree])
    for (const path of [
      join(repo, 'apps/web'),
      join(repo, 'apps/other'),
      join(worktree, 'apps/web'),
    ])
      await mkdir(path, { recursive: true })
    expect(await actual.getUpgradePreferenceKey(join(repo, 'apps/web'))).toBe(
      await actual.getUpgradePreferenceKey(join(worktree, 'apps/web'))
    )
    expect(
      await actual.getUpgradePreferenceKey(join(repo, 'apps/web'))
    ).not.toBe(await actual.getUpgradePreferenceKey(join(repo, 'apps/other')))
    expect(await actual.getUpgradePreferenceKey(root)).not.toBe(
      await actual.getUpgradePreferenceKey(repo)
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
