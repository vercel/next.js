import path from 'path'
import assert from 'assert'
import { flushAllTraces, setGlobal, trace } from 'next/src/trace'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { NextInstance, NextInstanceOpts } from './next-modes/base'
import { NextDevInstance } from './next-modes/next-dev'
import { NextStartInstance } from './next-modes/next-start'
import { NextDeployInstance } from './next-modes/next-deploy'
import { shouldRunTurboDevTest } from './next-test-utils'

export type { NextInstance }

// increase timeout to account for yarn install time
// if either test runs for the --turbo or have a custom timeout, set reduced timeout instead.
// this is due to current --turbo test have a lot of tests fails with timeouts, ends up the whole
// test job exceeds the 6 hours limit.
let testTimeout = shouldRunTurboDevTest()
  ? (240 * 1000) / 4
  : (process.platform === 'win32' ? 240 : 120) * 1000

if (process.env.NEXT_E2E_TEST_TIMEOUT) {
  try {
    testTimeout = parseInt(process.env.NEXT_E2E_TEST_TIMEOUT, 10)
  } catch (_) {
    // ignore
  }
}

jest.setTimeout(testTimeout)

const testsFolder = path.join(__dirname, '..')

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
    validE2EModes.includes(testMode),
    `NEXT_TEST_MODE must be one of ${validE2EModes.join(
      ', '
    )} for e2e tests but received ${testMode}`
  )
} else if (testModeFromFile === 'development') {
  testMode = 'dev'
} else if (testModeFromFile === 'production') {
  testMode = 'start'
}

if (testMode === 'dev') {
  ;(global as any).isNextDev = true
} else if (testMode === 'deploy') {
  ;(global as any).isNextDeploy = true
} else {
  ;(global as any).isNextStart = true
}

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
  opts: NextInstanceOpts & { skipStart?: boolean }
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

      nextInstance.on('destroy', () => {
        nextInstance = undefined
      })

      await nextInstance.setup(rootSpan)

      if (!opts.skipStart) {
        await rootSpan
          .traceChild('start next instance')
          .traceAsyncFn(async () => {
            await nextInstance.start()
          })
      }

      return nextInstance!
    })
  } catch (err) {
    require('console').error('Failed to create next instance', err)
    try {
      nextInstance.destroy()
    } catch (_) {}

    if (process.env.NEXT_TEST_CONTINUE_ON_ERROR) {
      // Other test should continue to create new instance if NEXT_TEST_CONTINUE_ON_ERROR explicitly specified.
      nextInstance = undefined
      throw err
    } else {
      process.exit(1)
    }
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
    if ((global as any).isNextDeploy) {
      // eslint-disable-next-line jest/no-focused-tests
      it.only('should skip next deploy', () => {})
      // No tests are run.
      skipped = true
    }
  }

  let next: NextInstance
  if (!skipped) {
    beforeAll(async () => {
      next = await createNext(options)
    })
    afterAll(async () => {
      // Gracefully destroy the instance if `createNext` success.
      // If next instance is not available, it's likely beforeAll hook failed and unnecessarily throws another error
      // by attempting to destroy on undefined.
      if (next) {
        await next.destroy()
      }
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
  })

  return {
    get isNextDev(): boolean {
      return Boolean((global as any).isNextDev)
    },
    get isTurbopack(): boolean {
      return Boolean(
        (global as any).isNextDev &&
          !process.env.TEST_WASM &&
          (options.turbo ?? shouldRunTurboDevTest())
      )
    },

    get isNextDeploy(): boolean {
      return Boolean((global as any).isNextDeploy)
    },
    get isNextStart(): boolean {
      return Boolean((global as any).isNextStart)
    },
    get next() {
      return nextProxy
    },
    skipped,
  }
}

/**
 * @deprecated use `nextTestSetup` directly.
 */
export function createNextDescribe(
  name: string,
  options: Parameters<typeof createNext>[0] & {
    skipDeployment?: boolean
    dir?: string
  },
  fn: (context: {
    isNextDev: boolean
    isNextDeploy: boolean
    isNextStart: boolean
    isTurbopack: boolean
    next: NextInstance
  }) => void
): void {
  describe(name, () => {
    const context = nextTestSetup(options)

    if (context.skipped) {
      return
    }

    fn(context)
  })
}
