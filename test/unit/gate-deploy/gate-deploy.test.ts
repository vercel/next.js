import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
import { _test_gate, installGate } from '../../lib/gate/runtime'
import { hasFixture } from '../../lib/gate/state'

// Exercise real deploy setup and config resolution, but never contact a
// deployment provider or run any user-supplied deployment/cleanup script.
jest.mock('execa', () => jest.fn())

const originalMode = process.env.NEXT_TEST_MODE
process.env.NEXT_TEST_MODE = 'deploy'
const {
  nextTestSetup,
  FileRef,
  PatchedFileRef,
}: typeof import('../../lib/e2e-utils') = require('../../lib/e2e-utils')
if (originalMode === undefined) delete process.env.NEXT_TEST_MODE
else process.env.NEXT_TEST_MODE = originalMode

const fixture = path.join(__dirname, 'fixtures')
type SetupOptions = Parameters<typeof nextTestSetup>[0]
type Hook = () => Promise<unknown>
const hookNames = ['beforeAll', 'beforeEach', 'afterEach', 'afterAll'] as const

/** Collect the real harness hooks and gate wrappers without nesting Jest tests. */
function collectSuite(
  options: SetupOptions,
  gatedDescribe = _test_gate(
    [{ force: true, source: '!deploy || !cacheComponents' }],
    'describe'
  )
) {
  const hooks = Object.fromEntries(
    hookNames.map((name) => [name, []])
  ) as Record<(typeof hookNames)[number], Hook[]>
  const bodies: Hook[] = []
  const userHooks = Object.fromEntries(
    hookNames.map((name) => [name, jest.fn()])
  ) as Record<(typeof hookNames)[number], jest.Mock>
  const body = jest.fn()
  let next: ReturnType<typeof nextTestSetup>['next']
  const originals = {
    describe: global.describe,
    it: global.it,
    test: global.test,
    ...Object.fromEntries(hookNames.map((name) => [name, global[name]])),
  }
  Object.assign(global, {
    describe: (_name: string, callback: () => void) => callback(),
    it: (_name: string, callback: Hook) => bodies.push(callback),
    test: (_name: string, callback: Hook) => bodies.push(callback),
    ...Object.fromEntries(
      hookNames.map((name) => [
        name,
        (callback: Hook) => hooks[name].push(callback),
      ])
    ),
  })
  try {
    installGate()
    gatedDescribe('fixture', () => {
      next = nextTestSetup(options).next
      for (const name of hookNames) global[name](userHooks[name])
      it('body', body)
    })
  } finally {
    Object.assign(global, originals)
  }
  return {
    hooks,
    userHooks,
    body,
    bodies,
    get next() {
      return next!
    },
  }
}

async function runSuite(suite: ReturnType<typeof collectSuite>) {
  try {
    for (const hook of suite.hooks.beforeAll) await hook()
    for (const body of suite.bodies) {
      for (const hook of suite.hooks.beforeEach) await hook()
      await body()
      for (const hook of suite.hooks.afterEach) await hook()
    }
  } finally {
    for (const hook of suite.hooks.afterAll) await hook()
  }
}

describe('lazy deployment force-gates', () => {
  let resolveConfig: jest.SpyInstance

  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NEXT_TEST_MODE: 'deploy',
      NEXT_TEST_DEPLOY_URL: '',
      NEXT_TEST_DEPLOY_SCRIPT_PATH: 'mock-deploy',
      NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH: 'mock-logs',
      NEXT_TEST_CLEANUP_SCRIPT_PATH: '',
      NEXT_TEST_PROXY_ADDRESS: '',
      NEXT_TEST_SKIP_CLEANUP: '',
      __NEXT_CACHE_COMPONENTS: '',
      __NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS: '',
    })
    jest.spyOn(require('console'), 'log').mockImplementation(() => {})
    jest.spyOn(require('console'), 'warn').mockImplementation(() => {})
    jest.spyOn(require('console'), 'error').mockImplementation(() => {})
    const { NextInstance } = require('../../lib/next-modes/base')
    resolveConfig = jest.spyOn(NextInstance.prototype, 'getResolvedConfig')
    jest.mocked(execa).mockImplementation((command) => {
      if (command === 'mock-deploy') {
        return Promise.resolve({
          exitCode: 0,
          stdout: 'https://fixture.test',
          stderr: '',
        }) as unknown as ReturnType<typeof execa>
      }
      if (command === 'mock-logs') {
        return Promise.resolve({
          exitCode: 0,
          stdout:
            'BUILD_ID: build\nDEPLOYMENT_ID: deployment\nNEXT_SUPPORTS_IMMUTABLE_ASSETS: 0\n',
          stderr: '',
        }) as unknown as ReturnType<typeof execa>
      }
      throw new Error(`Unexpected subprocess: ${command}`)
    })
  })

  afterEach(() => {
    try {
      if (hasFixture()) throw new Error('Suite leaked its registered fixture')
    } finally {
      jest.restoreAllMocks()
      jest.mocked(execa).mockReset()
    }
  })

  it.each([false, true])(
    'skips deployment and all user hooks with skipStart=%s',
    async (skipStart) => {
      process.env.NEXT_TEST_CLEANUP_SCRIPT_PATH =
        'must-not-clean-up-a-deployment'
      const suite = collectSuite({
        files: fixture,
        overrideFiles: {
          'next.config.js': new PatchedFileRef(
            path.join(fixture, 'next.config.js'),
            (content) => content.replace('false', 'true')
          ),
        },
        skipStart,
      })
      await runSuite(suite)
      expect(execa).not.toHaveBeenCalled()
      expect(suite.body).not.toHaveBeenCalled()
      for (const hook of Object.values(suite.userHooks)) {
        expect(hook).not.toHaveBeenCalled()
      }
      expect(await fs.pathExists(suite.next.testDir)).toBe(false)
      expect(require('console').warn).toHaveBeenCalledWith(
        expect.stringContaining('suite deployment skipped')
      )
    }
  )

  it('uses nextConfig and the fixture environment before deployment', async () => {
    const suite = collectSuite({
      files: {},
      nextConfig: {},
      env: { __NEXT_CACHE_COMPONENTS: 'true' },
    })
    await runSuite(suite)
    expect(execa).not.toHaveBeenCalled()
    expect(suite.body).not.toHaveBeenCalled()
  })

  it('honors an explicit config override of the Cache Components shard', async () => {
    process.env.__NEXT_CACHE_COMPONENTS = 'true'
    const suite = collectSuite({ files: new FileRef(fixture) })
    await runSuite(suite)
    expect(execa).toHaveBeenCalledWith('mock-deploy', [], expect.any(Object))
    expect(suite.body).toHaveBeenCalledTimes(1)
    for (const hook of Object.values(suite.userHooks)) {
      expect(hook).toHaveBeenCalledTimes(1)
    }
  })

  it('does not suppress a deployment failure when the gate allows it', async () => {
    jest.mocked(execa).mockRejectedValueOnce(new Error('fixture build failed'))
    const suite = collectSuite({ files: fixture })
    await expect(runSuite(suite)).rejects.toThrow('fixture build failed')
    expect(execa).toHaveBeenCalledTimes(1)
    expect(suite.body).not.toHaveBeenCalled()
  })

  it('fails when configuration cannot be resolved', async () => {
    const suite = collectSuite({
      files: fixture,
      overrideFiles: { 'next.config.js': 'throw new Error("broken config")' },
    })
    await expect(runSuite(suite)).rejects.toThrow('broken config')
    expect(execa).not.toHaveBeenCalled()
    expect(require('console').warn).not.toHaveBeenCalledWith(
      expect.stringContaining('suite deployment skipped')
    )
  })

  it('does not resolve config for suites without a lazy force-gate', async () => {
    const suite = collectSuite({ files: fixture }, _test_gate([], 'describe'))
    await runSuite(suite)
    expect(resolveConfig).not.toHaveBeenCalled()
    expect(suite.body).toHaveBeenCalledTimes(1)
  })

  it('keeps skip decisions scoped to each describe using the same gate', async () => {
    const gatedDescribe = _test_gate(
      [{ force: true, source: '!deploy || !cacheComponents' }],
      'describe'
    )
    const excluded = collectSuite(
      { files: {}, nextConfig: { cacheComponents: true } },
      gatedDescribe
    )
    const sibling = collectSuite({ files: fixture }, gatedDescribe)
    await runSuite(excluded)
    await runSuite(sibling)
    expect(excluded.body).not.toHaveBeenCalled()
    for (const hook of Object.values(excluded.userHooks)) {
      expect(hook).not.toHaveBeenCalled()
    }
    expect(sibling.body).toHaveBeenCalledTimes(1)
    for (const hook of Object.values(sibling.userHooks)) {
      expect(hook).toHaveBeenCalledTimes(1)
    }
  })
})
