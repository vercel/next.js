import path from 'path'
import assert from 'assert'
import { flushAllTraces, setGlobal, trace } from 'next/dist/trace'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { NextInstance, NextInstanceOpts } from '../next-modes/base'
import { NextDevInstance } from '../next-modes/next-dev'
import { NextStartInstance } from '../next-modes/next-start'
import { NextDeployInstance } from '../next-modes/next-deploy'
import { shouldRunTurboDevTest } from '../next-test-utils'
import {
  getCurrentTestContext,
  type TestSuiteContext,
} from '../jest-reflection'

export type { NextInstance }

const testContext = getCurrentTestContext()
if (!testContext) {
  throw new Error('e2e-utils requires Jest test context to be set up')
}

function determineTestTimeout(): number {
  if (process.env.NEXT_E2E_TEST_TIMEOUT) {
    const testTimeoutFromEnv = Number.parseInt(
      process.env.NEXT_E2E_TEST_TIMEOUT,
      10
    )
    if (Number.isNaN(testTimeoutFromEnv)) {
      throw new Error(
        `NEXT_E2E_TEST_TIMEOUT must be a number, got: ${JSON.stringify(process.env.NEXT_E2E_TEST_TIMEOUT)}`
      )
    }
    return testTimeoutFromEnv
  }

  // increase timeout to account for pnpm install time
  // if either test runs for the --turbo or have a custom timeout, set reduced timeout instead.
  // this is due to current --turbo test have a lot of tests fails with timeouts, ends up the whole
  // test job exceeds the 6 hours limit.
  return shouldRunTurboDevTest()
    ? (240 * 1000) / 2
    : (process.platform === 'win32' ? 240 : 120) * 1000
}

jest.setTimeout(determineTestTimeout())

const TEST_MODES = ['dev', 'start', 'deploy'] as const
type TestMode = (typeof TEST_MODES)[number]

function determineTestMode(testContext: TestSuiteContext): TestMode {
  const testFile = testContext.testPathRelativeToRepo
  const rootDirName = path.basename(testContext.rootDir)

  const testFolders = ['e2e', 'development', 'production'] as const

  const testTypeFromFile = testFolders.find((dir) =>
    testFile.startsWith(path.join(rootDirName, dir))
  )
  if (!testTypeFromFile) {
    throw new Error(
      [
        `Failed to determine test type for '${testFile}'.`,
        `'e2e-utils' can only be imported from a file in these directories:`,
        ...[testFolders.map((dir) => `  - ${path.join(rootDirName, dir)}`)],
      ].join('\n')
    )
  }

  if (testTypeFromFile === 'e2e') {
    const testModeFromEnv = process.env.NEXT_TEST_MODE
    if (!testModeFromEnv) {
      if (!process.env.NEXT_TEST_JOB) {
        // if we're not in CI, we can be lenient and default to 'start'
        require('console').warn(
          'Warn: no NEXT_TEST_MODE set, using default of start'
        )
        return 'start'
      } else {
        // if we're in CI, we should be strict
        throw new Error(
          `No 'NEXT_TEST_MODE' set in environment, this is required for e2e-utils`
        )
      }
    }

    assert(
      (TEST_MODES as readonly string[]).includes(testModeFromEnv),
      `NEXT_TEST_MODE must be one of ${TEST_MODES.join(
        ', '
      )} for e2e tests but received ${testModeFromEnv}`
    )
    return testModeFromEnv as TestMode
  } else if (testTypeFromFile === 'development') {
    return 'dev'
  } else if (testTypeFromFile === 'production') {
    return 'start'
  } else {
    throw new Error()
  }
}

const testMode = determineTestMode(testContext)

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
export const isNextStart = testMode === 'start'

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
 * to prevent relying on modules that shouldn't be
 */
export async function createNext(
  opts: NextInstanceOpts & { skipStart?: boolean; patchFileDelay?: number }
): Promise<NextInstance> {
  try {
    if (nextInstance) {
      throw new Error(`createNext called without destroying previous instance`)
    }

    setupTracing()
    return await trace('createNext').traceAsyncFn(async (rootSpan) => {
      const useTurbo = !!process.env.TEST_WASM
        ? false
        : opts?.turbo ?? shouldRunTurboDevTest()

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
            turbo: false,
          })
        })
      } else {
        // next build + next start
        rootSpan.traceChild('init next start instance').traceFn(() => {
          nextInstance = new NextStartInstance({
            ...opts,
            turbo: false,
          })
        })
      }

      nextInstance = nextInstance!

      nextInstance.on('destroy', () => {
        nextInstance = undefined
      })

      await nextInstance.setup(rootSpan)

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

  let next: NextInstance | undefined
  if (!skipped) {
    beforeAll(async () => {
      next = await createNext(options)
    })
    afterAll(async () => {
      // Gracefully destroy the instance if `createNext` success.
      // If next instance is not available, it's likely beforeAll hook failed and unnecessarily throws another error
      // by attempting to destroy on undefined.
      await next?.destroy()
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
    get isTurbopack(): boolean {
      return Boolean(
        !process.env.TEST_WASM && (options.turbo ?? shouldRunTurboDevTest())
      )
    },

    get isNextDeploy() {
      return isNextDeploy
    },
    get isNextStart() {
      return isNextStart
    },
    get next() {
      return nextProxy
    },
    skipped,
  }
}
