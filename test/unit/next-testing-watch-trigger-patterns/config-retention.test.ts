import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  openTestConfiguration,
  normalizeTestConfig,
} from 'next/dist/experimental/testing/config'
import {
  openTestConfigModule,
  openTestProjectModules,
} from 'next/dist/experimental/testing/config-modules'

jest.mock('next/dist/experimental/testing/config-modules', () => ({
  openTestConfigModule: jest.fn(),
  openTestProjectModules: jest.fn(async () => undefined),
}))

async function fixture() {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'next-trigger-config-retain-')
  )
  const configFile = path.join(directory, 'vitest.config.mjs')
  const helper = path.join(directory, 'rules.mjs')
  await writeFile(configFile, 'export default {test:{}}\n')
  await writeFile(helper, 'export const value=1\n')
  let closed = false
  const closedError = new Error('actual retained configuration owner closed')
  const realm = {
    value: { test: {} },
    hasWatchTriggers: true,
    watchTriggerInputsCurrent: true,
    watchTriggerInputs: [configFile, helper],
    compilerTransformNames: [] as string[],
    compilerTransformInputs: [],
    compilerAliases: undefined as unknown,
    retainForWatch: jest.fn(() => {
      if (closed) throw closedError
    }),
    dispose: jest.fn(async () => {
      closed = true
    }),
    teardown: async () => {},
  }
  jest
    .mocked(openTestConfigModule)
    .mockResolvedValue(
      realm as unknown as Awaited<ReturnType<typeof openTestConfigModule>>
    )
  jest.mocked(openTestProjectModules).mockResolvedValue(undefined)
  return { directory, configFile, helper, realm, closedError }
}

afterEach(() => jest.clearAllMocks())

it('certifies only the actual retained root inputs and keeps every helper watched', async () => {
  const input = await fixture()
  const session = await openTestConfiguration(input.directory)
  try {
    expect(session.watchInputs).toContain(input.configFile)
    expect(session.watchInputs).toContain(input.helper)
    expect(
      await session.certifyWatchTriggerSelection(new AbortController().signal)
    ).toBe(true)
    expect(input.realm.retainForWatch).toHaveBeenCalledTimes(1)
    input.realm.watchTriggerInputsCurrent = false
    expect(
      await session.certifyWatchTriggerSelection(new AbortController().signal)
    ).toBe(false)
    expect(input.realm.retainForWatch).toHaveBeenCalledTimes(1)
  } finally {
    await session.dispose()
    await rm(input.directory, { recursive: true, force: true })
  }
})

it.each(['config', 'helper'] as const)(
  'vetoes the producer fact when actual %s bytes change',
  async (changed) => {
    const input = await fixture()
    const session = await openTestConfiguration(input.directory)
    try {
      await writeFile(
        changed === 'config' ? input.configFile : input.helper,
        'export const changed=2\n'
      )
      expect(
        await session.certifyWatchTriggerSelection(new AbortController().signal)
      ).toBe(false)
      expect(input.realm.retainForWatch).not.toHaveBeenCalled()
    } finally {
      await session.dispose()
      await rm(input.directory, { recursive: true, force: true })
    }
  }
)

it('cannot certify or recreate definitions after their real realm is disposed', async () => {
  const input = await fixture()
  const session = await openTestConfiguration(input.directory)
  try {
    await session.dispose()
    await expect(
      session.certifyWatchTriggerSelection(new AbortController().signal)
    ).rejects.toBe(input.closedError)
  } finally {
    await rm(input.directory, { recursive: true, force: true })
  }
})

it('keeps external project owners outside the first retained-root certificate', async () => {
  const input = await fixture()
  jest.mocked(openTestProjectModules).mockResolvedValue({
    config: normalizeTestConfig({ test: {} }),
    compilerInputsForProjects: () => [],
    dispose: async () => {},
    teardown: async () => {},
  } as unknown as NonNullable<
    Awaited<ReturnType<typeof openTestProjectModules>>
  >)
  const session = await openTestConfiguration(input.directory)
  try {
    expect(
      await session.certifyWatchTriggerSelection(new AbortController().signal)
    ).toBe(false)
    await expect(
      session.retainWatchTriggersForWatch(new AbortController().signal)
    ).rejects.toThrow(
      'external project configuration owners are not implemented'
    )
    expect(input.realm.retainForWatch).not.toHaveBeenCalled()
  } finally {
    await session.dispose()
    await rm(input.directory, { recursive: true, force: true })
  }
})

it.each(['transform', 'alias'] as const)(
  'keeps the certificate conservative for an actual %s owner',
  async (kind) => {
    const input = await fixture()
    if (kind === 'transform')
      input.realm.compilerTransformNames = ['actual-transform']
    else input.realm.compilerAliases = { actual: 'alias-owner' }
    const session = await openTestConfiguration(input.directory)
    try {
      expect(
        await session.certifyWatchTriggerSelection(new AbortController().signal)
      ).toBe(false)
      expect(input.realm.retainForWatch).not.toHaveBeenCalled()
    } finally {
      await session.dispose()
      await rm(input.directory, { recursive: true, force: true })
    }
  }
)
