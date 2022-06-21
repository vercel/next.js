import path from 'path'
import assert from 'assert'
import { NextConfig } from 'next'
import { InstallCommand, NextInstance, PackageJson } from './next-modes/base'
import { NextDevInstance } from './next-modes/next-dev'
import { NextStartInstance } from './next-modes/next-start'
import { NextDeployInstance } from './next-modes/next-deploy'

// increase timeout to account for yarn install time
jest.setTimeout(240 * 1000)

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

/**
 * Sets up and manages a Next.js instance in the configured
 * test mode. The next instance will be isolated from the monorepo
 * to prevent relying on modules that shouldn't be
 */
export async function createNext(opts: {
  files:
    | FileRef
    | {
        [filename: string]: string | FileRef
      }
  dependencies?: {
    [name: string]: string
  }
  nextConfig?: NextConfig
  skipStart?: boolean
  installCommand?: InstallCommand
  buildCommand?: string
  packageJson?: PackageJson
  startCommand?: string
  packageLockPath?: string
  env?: Record<string, string>
}): Promise<NextInstance> {
  try {
    if (nextInstance) {
      throw new Error(`createNext called without destroying previous instance`)
    }

    if (testMode === 'dev') {
      // next dev
      nextInstance = new NextDevInstance(opts)
    } else if (testMode === 'deploy') {
      // Vercel
      nextInstance = new NextDeployInstance(opts)
    } else {
      // next build + next start
      nextInstance = new NextStartInstance(opts)
    }

    nextInstance.on('destroy', () => {
      nextInstance = undefined
    })

    await nextInstance.setup()

    if (!opts.skipStart) {
      await nextInstance.start()
    }
    return nextInstance!
  } catch (err) {
    require('console').error('Failed to create next instance', err)
    try {
      nextInstance.destroy()
    } catch (_) {}
    process.exit(1)
  }
}
