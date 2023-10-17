import { bold, cyan, red, yellow } from './picocolors'
import path from 'path'

import { hasNecessaryDependencies } from './has-necessary-dependencies'
import type { NecessaryDependencies } from './has-necessary-dependencies'
import semver from 'next/dist/compiled/semver'
import { CompileError } from './compile-error'
import * as log from '../build/output/log'

import { getTypeScriptIntent } from './typescript/getTypeScriptIntent'
import type { TypeCheckResult } from './typescript/runTypeCheck'
import { writeAppTypeDeclarations } from './typescript/writeAppTypeDeclarations'
import { writeConfigurationDefaults } from './typescript/writeConfigurationDefaults'
import { installDependencies } from './install-dependencies'
import { isCI } from '../telemetry/ci-info'
import { missingDepsError } from './typescript/missingDependencyError'

const requiredPackages = [
  {
    file: 'typescript/lib/typescript.js',
    pkg: 'typescript',
    exportsRestrict: true,
  },
  {
    file: '@types/react/index.d.ts',
    pkg: '@types/react',
    exportsRestrict: true,
  },
  {
    file: '@types/node/index.d.ts',
    pkg: '@types/node',
    exportsRestrict: true,
  },
]

export async function verifyTypeScriptSetup({
  dir,
  distDir,
  cacheDir,
  intentDirs,
  tsconfigPath,
  typeCheckPreflight,
  disableStaticImages,
  hasAppDir,
  hasPagesDir,
}: {
  dir: string
  distDir: string
  cacheDir?: string
  tsconfigPath: string
  intentDirs: string[]
  typeCheckPreflight: boolean
  disableStaticImages: boolean
  hasAppDir: boolean
  hasPagesDir: boolean
}): Promise<{ result?: TypeCheckResult; version: string | null }> {
  const resolvedTsConfigPath = path.join(dir, tsconfigPath)

  try {
    // Check if the project uses TypeScript:
    const intent = await getTypeScriptIntent(dir, intentDirs, tsconfigPath)
    if (!intent) {
      return { version: null }
    }

    // Ensure TypeScript and necessary `@types/*` are installed:
    let deps: NecessaryDependencies = await hasNecessaryDependencies(
      dir,
      requiredPackages
    )

    if (deps.missing?.length > 0) {
      if (isCI) {
        // we don't attempt auto install in CI to avoid side-effects
        // and instead log the error for installing needed packages
        missingDepsError(dir, deps.missing)
      }
      console.log(
        bold(
          yellow(
            `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
          )
        ) +
          '\n' +
          'Installing dependencies' +
          '\n\n' +
          bold(
            'If you are not trying to use TypeScript, please remove the ' +
              cyan('tsconfig.json') +
              ' file from your package root (and any TypeScript files in your pages directory).'
          ) +
          '\n'
      )
      await installDependencies(dir, deps.missing, true).catch((err) => {
        if (err && typeof err === 'object' && 'command' in err) {
          console.error(
            `Failed to install required TypeScript dependencies, please install them manually to continue:\n` +
              (err as any).command +
              '\n'
          )
        }
        throw err
      })
      deps = await hasNecessaryDependencies(dir, requiredPackages)
    }

    // Load TypeScript after we're sure it exists:
    const tsPath = deps.resolved.get('typescript')!
    const ts = (await Promise.resolve(
      require(tsPath)
    )) as typeof import('typescript')

    if (semver.lt(ts.version, '4.5.2')) {
      log.warn(
        `Minimum recommended TypeScript version is v4.5.2, older versions can potentially be incompatible with Next.js. Detected: ${ts.version}`
      )
    }

    // Reconfigure (or create) the user's `tsconfig.json` for them:
    await writeConfigurationDefaults(
      ts,
      resolvedTsConfigPath,
      intent.firstTimeSetup,
      hasAppDir,
      distDir,
      hasPagesDir
    )
    // Write out the necessary `next-env.d.ts` file to correctly register
    // Next.js' types:
    await writeAppTypeDeclarations({
      baseDir: dir,
      imageImportsEnabled: !disableStaticImages,
      hasPagesDir,
      isAppDirEnabled: hasAppDir,
    })

    let result
    if (typeCheckPreflight) {
      const { runTypeCheck } = require('./typescript/runTypeCheck')

      // Verify the project passes type-checking before we go to webpack phase:
      result = await runTypeCheck(
        ts,
        dir,
        distDir,
        resolvedTsConfigPath,
        cacheDir,
        hasAppDir
      )
    }
    return { result, version: ts.version }
  } catch (err) {
    // These are special errors that should not show a stack trace:
    if (err instanceof CompileError) {
      console.error(red('Failed to compile.\n'))
      console.error(err.message)
      process.exit(1)
    }

    /**
     * verifyTypeScriptSetup can be either invoked directly in the main thread (during next dev / next lint)
     * or run in a worker (during next build). In the latter case, we need to print the error message, as the
     * parent process will only receive an `Jest worker encountered 1 child process exceptions, exceeding retry limit`.
     */

    // we are in a worker, print the error message and exit the process
    if (process.env.JEST_WORKER_ID) {
      if (err instanceof Error) {
        console.error(err.message)
      } else {
        console.error(err)
      }
      process.exit(1)
    }
    // we are in the main thread, throw the error and it will be handled by the caller
    throw err
  }
}
