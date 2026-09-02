import path from 'path'
import assert from 'assert'
import { flushAllTraces, setGlobal, trace } from 'next/dist/trace'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from 'next/constants'
import { NextInstance, NextInstanceOpts } from '../next-modes/base'
import { NextDevInstance } from '../next-modes/next-dev'
import { NextStartInstance } from '../next-modes/next-start'
import { NextDeployInstance } from '../next-modes/next-deploy'
import { shouldUseTurbopack } from '../next-test-utils'
import { setGateTestContext, type GateTestMode } from '../gate/test-context'
import { clearFixture, registerFixture } from '../gate/state'
import { loadResolvedConfig } from '../gate/load-resolved-config'
import {
  getActiveDescribeGates,
  hasLazyForceGate,
  findLazyForceSkip,
} from '../gate/runtime'

export type { NextInstance }
export type { Playwright } from '../browsers/playwright'

const individualTestTimeout = 60 * 1000

// Keep a higher timeout for setup hooks (e.g. initial createNext/startup),
// but enforce 60s per test case via wrapped `it`/`test` for non-dev modes.
let setupTimeout = (process.platform === 'win32' ? 240 : 120) * 1000

if (process.env.NEXT_E2E_TEST_TIMEOUT) {
  const parsedTimeout = Number.parseInt(process.env.NEXT_E2E_TEST_TIMEOUT, 10)
  if (!Number.isNaN(parsedTimeout)) {
    setupTimeout = parsedTimeout
  }
}

jest.setTimeout(setupTimeout)

type E2ETestGlobal = typeof globalThis & {
  __NEXT_E2E_TEST_CONFIG_PATCHED__?: boolean
  __NEXT_E2E_WRAPPED_TEST_FNS__?: WeakMap<Function, Function>
}

const wrapJestTestFn = <T extends Function>(fn: T): T => {
  const e2eGlobal = global as E2ETestGlobal
  const wrappedFns =
    e2eGlobal.__NEXT_E2E_WRAPPED_TEST_FNS__ ??
    (e2eGlobal.__NEXT_E2E_WRAPPED_TEST_FNS__ = new WeakMap())
  const existing = wrappedFns.get(fn)
  if (existing) return existing as T

  const wrapped = new Proxy(fn, {
    apply(target, thisArg, argArray: unknown[]) {
      const args = [...argArray]
      if (
        args.length >= 2 &&
        typeof args[1] === 'function' &&
        args[2] === undefined
      ) {
        args[2] = individualTestTimeout
      }

      const result = Reflect.apply(target, thisArg, args)
      return typeof result === 'function' ? wrapJestTestFn(result) : result
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? wrapJestTestFn(value) : value
    },
  })

  wrappedFns.set(fn, wrapped)
  return wrapped as T
}

const testsFolder = path.join(__dirname, '..', '..')

let testFile
const testFileRegex = /\.test\.(js|tsx?)/

const visitedModules = new Set()
const checkParent = (mod) => {
  if (!mod?.parent || visitedModules.has(mod)) return
  testFile = mod.parent.filename || ''
  visitedModules.add(mod)

  if (!testFileRegex.test(testFile)) {
    checkParent(mod.parent)
  }
}
checkParent(module)

process.env.TEST_FILE_PATH = testFile

let testMode = process.env.NEXT_TEST_MODE

if (!testFileRegex.test(testFile)) {
  throw new Error(
    `e2e-utils imported from non-test file ${testFile} (must end with .test.(js,ts,tsx)`
  )
}

const testFolderModes = ['e2e', 'development', 'production']

const testModeFromFile = testFolderModes.find((mode) =>
  testFile.startsWith(path.join(testsFolder, mode))
)

if (testModeFromFile === 'e2e') {
  const validE2EModes = ['dev', 'start', 'deploy']

  if (!process.env.NEXT_TEST_JOB && !testMode) {
    require('console').warn(
      'Warn: no NEXT_TEST_MODE set, using default of start'
    )
    testMode = 'start'
  }
  assert(
    validE2EModes.includes(testMode!),
    `NEXT_TEST_MODE must be one of ${validE2EModes.join(
      ', '
    )} for e2e tests but received ${testMode}`
  )
} else if (testModeFromFile === 'development') {
  testMode = 'dev'
} else if (testModeFromFile === 'production') {
  testMode = 'start'
}

const e2eGlobal = global as E2ETestGlobal
if (!e2eGlobal.__NEXT_E2E_TEST_CONFIG_PATCHED__) {
  if (testMode !== 'dev') {
    if (typeof global.it === 'function') {
      global.it = wrapJestTestFn(global.it) as jest.It
    }
    if (typeof global.test === 'function') {
      global.test = wrapJestTestFn(global.test) as jest.It
    }

    if (process.env.NEXT_TEST_CI && !process.env.NEXT_FLAKE_DETECTION) {
      jest.retryTimes(1)
    }
  }

  e2eGlobal.__NEXT_E2E_TEST_CONFIG_PATCHED__ = true
}

if (testMode === 'dev') {
  ;(global as any).isNextDev = true
} else if (testMode === 'deploy') {
  ;(global as any).isNextDeploy = true
} else {
  ;(global as any).isNextStart = true
}

/**
 * Whether the test is running in development mode.
 * Based on `process.env.NEXT_TEST_MODE` and the test directory.
 */
export const isNextDev = testMode === 'dev'
/**
 * Whether the test is running in deploy mode.
 * Based on `process.env.NEXT_TEST_MODE`.
 */
export const isNextDeploy = testMode === 'deploy'
/**
 * Whether the test is running in start mode.
 * Default mode. `true` when both `isNextDev` and `isNextDeploy` are false.
 */
export const isNextStart = !isNextDev && !isNextDeploy

if (!process.env.NEXT_TEST_WASM && process.env.NEXT_TEST_WASM_AFTER_JEST) {
  process.env.NEXT_TEST_WASM = process.env.NEXT_TEST_WASM_AFTER_JEST
}

export const isRspack = !!process.env.NEXT_RSPACK
const isNextTestWasm = !!process.env.NEXT_TEST_WASM
export const itTurbopack =
  !isNextTestWasm && shouldUseTurbopack() ? it : it.skip

/**
 * Whether the test is running against React 18 (based on
 * `process.env.NEXT_TEST_REACT_VERSION`). When the env var is unset or empty,
 * the test install uses the default React peer dependency version which is
 * currently React 19, so this is `false`.
 */
export const isReact18 =
  parseInt(process.env.NEXT_TEST_REACT_VERSION || '', 10) === 18

// Publish the statically-known shape of this run for `// @gate` pragmas. See
// test/lib/gate/conditions.ts.
setGateTestContext({
  mode: testMode as GateTestMode,
  bundler: isRspack
    ? 'rspack'
    : !isNextTestWasm && shouldUseTurbopack()
      ? 'turbopack'
      : 'webpack',
  react18: isReact18,
  wasm: isNextTestWasm,
})

if (!testMode) {
  throw new Error(
    `No 'NEXT_TEST_MODE' set in environment, this is required for e2e-utils`
  )
}
require('console').warn(
  `Using test mode: ${testMode} in test folder ${testModeFromFile}`
)

/**
 * FileRef is wrapper around a file path that is meant be copied
 * to the location where the next instance is being created
 */
export class FileRef {
  public fsPath: string

  constructor(path: string) {
    this.fsPath = path
  }
}

/**
 * FileRef is wrapper around a file path that is meant be copied
 * to the location where the next instance is being created
 */
export class PatchedFileRef {
  public fsPath: string
  public cb: (content: string) => string

  constructor(path: string, cb: (content: string) => string) {
    this.fsPath = path
    this.cb = cb
  }
}

let nextInstance: NextInstance | undefined = undefined

if (typeof afterAll === 'function') {
  afterAll(async () => {
    if (nextInstance) {
      await nextInstance.destroy()
      throw new Error(
        `next instance not destroyed before exiting, make sure to call .destroy() after the tests after finished`
      )
    }
  })
}

const setupTracing = () => {
  if (!process.env.NEXT_TEST_TRACE) return

  setGlobal('distDir', './test/.trace')
  // This is a hacky way to use tracing utils even for tracing test utils.
  // We want the same treatment as DEVELOPMENT_SERVER - adds a reasonable treshold for logs size.
  setGlobal('phase', PHASE_DEVELOPMENT_SERVER)
}

/**
 * Sets up and manages a Next.js instance in the configured
 * test mode. The next instance will be isolated from the monorepo
 * to prevent relying on modules that shouldn't be.
 *
 * Internal helper used by `nextTestSetup`. Tests should call
 * `nextTestSetup` directly instead of `createNext`.
 */
async function createNext(
  opts: NextInstanceOpts & { skipStart?: boolean; patchFileDelay?: number }
): Promise<NextInstance> {
  try {
    if (nextInstance) {
      throw new Error(`createNext called without destroying previous instance`)
    }

    setupTracing()
    return await trace('createNext').traceAsyncFn(async (rootSpan) => {
      const useTurbo = isNextTestWasm
        ? false
        : (opts?.turbo ?? shouldUseTurbopack())

      if (testMode === 'dev') {
        // next dev
        rootSpan.traceChild('init next dev instance').traceFn(() => {
          nextInstance = new NextDevInstance({
            ...opts,
            turbo: useTurbo,
          })
        })
      } else if (testMode === 'deploy') {
        // Vercel
        rootSpan.traceChild('init next deploy instance').traceFn(() => {
          nextInstance = new NextDeployInstance({
            ...opts,
          })
        })
      } else {
        // next build + next start
        rootSpan.traceChild('init next start instance').traceFn(() => {
          nextInstance = new NextStartInstance({
            ...opts,
          })
        })
      }

      nextInstance = nextInstance!

      nextInstance.on('destroy', () => {
        nextInstance = undefined
        clearFixture()
      })

      await nextInstance.setup(rootSpan)

      // Lazy `// @gate` conditions read this fixture's resolved next.config.
      // Registering the instance (not a snapshot) before `start()` keeps
      // `skipStart` suites and rebuild flows working: nothing is resolved until
      // a gate actually asks. See test/lib/gate/README.md.
      registerFixture(nextInstance)

      if (!opts.skipStart) {
        await rootSpan
          .traceChild('start next instance')
          .traceAsyncFn(async () => {
            await nextInstance!.start()
          })
      }

      return nextInstance!
    })
  } catch (err) {
    require('console').error('Failed to create next instance', err)
    try {
      await nextInstance?.destroy()
    } catch (_) {}

    nextInstance = undefined
    // Throw instead of process exit to ensure that Jest reports the tests as failed.
    throw err
  } finally {
    flushAllTraces()
  }
}

export function nextTestSetup(
  options: Parameters<typeof createNext>[0] & {
    skipDeployment?: boolean
    dir?: string
  }
): {
  isNextDev: boolean
  isNextDeploy: boolean
  isNextStart: boolean
  isTurbopack: boolean
  isRspack: boolean
  next: NextInstance
  skipped: boolean
} {
  let skipped = false

  if (options.skipDeployment) {
    // When the environment is running for deployment tests.
    if (isNextDeploy) {
      // eslint-disable-next-line jest/no-focused-tests
      it.only('should skip next deploy', () => {})
      // No tests are run.
      skipped = true
    }
  }

  // A lazy `@force-gate` on the enclosing `describe` (e.g. `!cacheComponents`)
  // gates the *build*, not just the test bodies: some fixtures can't build
  // under the condition at all. Snapshot the describe's gates now, while the
  // describe body is still being collected — the stack is empty by `beforeAll`.
  // Suites that manage their own build (`skipStart`) are left untouched.
  const describeGates = getActiveDescribeGates()
  // Deploy's "build" is a remote deployment we can't gate this way, and suites
  // that pass `skipStart` build manually — leave both to their own handling.
  const buildForceGated =
    !options.skipStart && !isNextDeploy && hasLazyForceGate(describeGates)

  let next: NextInstance | undefined
  if (!skipped) {
    beforeAll(async () => {
      if (!buildForceGated) {
        next = await createNext(options)
        return
      }
      // Try to decide the force-gate against the *source* fixture first,
      // before paying for the fixture setup (which includes a dependency
      // install when the run is isolated). The config resolver falls back to
      // the repo's own `next` when the directory has no install, and the env
      // mirrors what `getSpawnOpts` hands every fixture child process. An
      // inline `files` object has no directory to resolve against, and any
      // resolution failure (e.g. a config that imports from the fixture's
      // own node_modules) falls through to the instance-based decision below.
      if (typeof options.files === 'string') {
        const config = await loadResolvedConfig({
          dir: options.files,
          phase: isNextDev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_BUILD,
          env: {
            ...process.env,
            ...options.env,
            NODE_ENV: (options.env?.NODE_ENV ||
              '') as NodeJS.ProcessEnv['NODE_ENV'],
            PORT: '0',
            __NEXT_TEST_MODE: 'e2e',
          },
        }).catch(() => null)
        const earlySkip = config && findLazyForceSkip(describeGates, config)
        if (earlySkip) {
          // No instance ever exists on this path, so register the resolved
          // config directly for the per-test force-pass decisions.
          registerFixture({ getResolvedConfig: async () => config })
          require('console').warn(
            `  ⚠ suite build skipped by \`@force-gate ${earlySkip.source}\` ` +
              `(decided from the source fixture; setup skipped)`
          )
          return
        }
      }
      // Set the fixture up (so its config is resolvable) without building, then
      // resolve the force-gate. If it's false, skip the build entirely — the
      // inherited gate makes every test force-pass, so nothing touches `next`.
      const instance = await createNext({ ...options, skipStart: true })
      next = instance
      const config = await instance.getResolvedConfig()
      const forceSkip = findLazyForceSkip(describeGates, config)
      if (forceSkip) {
        require('console').warn(
          `  ⚠ suite build skipped by \`@force-gate ${forceSkip.source}\``
        )
        return
      }
      try {
        await instance.start()
      } catch (err) {
        await instance.destroy().catch(() => {})
        next = undefined
        throw err
      }
    })
    afterAll(async () => {
      // Gracefully destroy the instance if `createNext` success.
      // If next instance is not available, it's likely beforeAll hook failed and unnecessarily throws another error
      // by attempting to destroy on undefined.
      await next?.destroy()
      // The early force-skip path registers a config source without an
      // instance (an instance clears itself on destroy).
      if (!next) clearFixture()
    })
  }

  const nextProxy = new Proxy<NextInstance>({} as NextInstance, {
    get: function (_target, property) {
      if (!next) {
        throw new Error(
          'next instance is not initialized yet, make sure you call methods on next instance in test body.'
        )
      }
      const prop = next[property]
      return typeof prop === 'function' ? prop.bind(next) : prop
    },
    set: function (_target, key, value) {
      if (!next) {
        throw new Error(
          'next instance is not initialized yet, make sure you call methods on next instance in test body.'
        )
      }
      next[key] = value
      return true
    },
  })

  return {
    get isNextDev() {
      return isNextDev
    },
    get isNextDeploy() {
      return isNextDeploy
    },
    get isNextStart() {
      return isNextStart
    },
    get isTurbopack() {
      return Boolean(!isNextTestWasm && (options.turbo ?? shouldUseTurbopack()))
    },
    get isRspack() {
      return isRspack
    },
    get next() {
      return nextProxy
    },
    skipped,
  }
}
