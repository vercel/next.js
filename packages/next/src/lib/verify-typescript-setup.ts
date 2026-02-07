import { bold, cyan, red, yellow } from './picocolors'
import path, { join } from 'path'

import { hasNecessaryDependencies } from './has-necessary-dependencies'
import type {
  MissingDependency,
  NecessaryDependencies,
} from './has-necessary-dependencies'
import semver from 'next/dist/compiled/semver'
import { CompileError } from './compile-error'
import * as log from '../build/output/log'

import { getTypeScriptIntent } from './typescript/getTypeScriptIntent'
import type { TypeCheckResult } from './typescript/runTypeCheck'
import { writeAppTypeDeclarations } from './typescript/writeAppTypeDeclarations'
import { writeConfigurationDefaults } from './typescript/writeConfigurationDefaults'
import { installDependencies } from './install-dependencies'
import { isCI } from '../server/ci-info'
import { missingDepsError } from './typescript/missingDependencyError'
import { resolveFrom } from './resolve-from'

const typescriptPackage: MissingDependency = {
  file: 'typescript/lib/typescript.js',
  pkg: 'typescript',
  exportsRestrict: true,
}

const requiredPackages: MissingDependency[] = [
  typescriptPackage,
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

/**
 * Check if @typescript/native-preview is installed as an alternative TypeScript compiler.
 * This is a Go-based native TypeScript compiler that can be used instead of the standard
 * TypeScript package for faster compilation.
 */
function hasNativeTypeScriptPreview(dir: string): boolean {
  try {
    resolveFrom(dir, '@typescript/native-preview/package.json')
    return true
  } catch {
    return false
  }
}

export async function verifyTypeScriptSetup({
  dir,
  distDir,
  distDirRoot,
  cacheDir,
  strictRouteTypes,
  tsconfigPath,
  typeCheckPreflight,
  disableStaticImages,
  hasAppDir,
  hasPagesDir,
  appDir,
  pagesDir,
  debugBuildPaths,
}: {
  dir: string
  distDir: string
  /** The root dist directory without /dev suffix, used for fixed type paths */
  distDirRoot?: string
  cacheDir?: string
  strictRouteTypes: boolean
  tsconfigPath: string | undefined
  typeCheckPreflight: boolean
  disableStaticImages: boolean
  hasAppDir: boolean
  hasPagesDir: boolean
  appDir?: string
  pagesDir?: string
  debugBuildPaths?: { app?: string[]; pages?: string[] }
}): Promise<{ result?: TypeCheckResult; version: string | null }> {
  const tsConfigFileName = tsconfigPath || 'tsconfig.json'
  const resolvedTsConfigPath = path.join(dir, tsConfigFileName)

  // Construct intentDirs from appDir and pagesDir for getTypeScriptIntent
  const intentDirs = [pagesDir, appDir].filter(Boolean) as string[]

  try {
    // Check if the project uses TypeScript:
    const intent = await getTypeScriptIntent(dir, intentDirs, tsConfigFileName)
    if (!intent) {
      return { version: null }
    }

    // Check if @typescript/native-preview is installed as an alternative
    const hasNativePreview = hasNativeTypeScriptPreview(dir)

    // Ensure TypeScript and necessary `@types/*` are installed:
    let deps: NecessaryDependencies = hasNecessaryDependencies(
      dir,
      requiredPackages
    )

    // If @typescript/native-preview is installed and only the typescript package is missing,
    // we can skip auto-installing typescript since the native preview provides TS compilation.
    // However, we still need @types/react and @types/node for type checking.
    if (hasNativePreview && deps.missing?.length > 0) {
      const missingWithoutTypescript = deps.missing.filter(
        (dep) => dep.pkg !== 'typescript'
      )
      const onlyTypescriptMissing =
        deps.missing.length === 1 && deps.missing[0].pkg === 'typescript'

      if (onlyTypescriptMissing) {
        // @typescript/native-preview is installed and only typescript is missing
        // Skip installation and return early - the project can use the native preview
        log.info(
          `Detected ${bold('@typescript/native-preview')} as TypeScript compiler. ` +
            `Some Next.js TypeScript features (like type checking during build) require the standard ${bold('typescript')} package.`
        )

        // Still write type declarations since they don't require the typescript package
        await writeAppTypeDeclarations({
          baseDir: dir,
          distDir,
          distDirRoot,
          imageImportsEnabled: !disableStaticImages,
          hasPagesDir,
          hasAppDir,
        })

        return { version: null }
      }

      // If there are other missing deps besides typescript, only install those
      if (
        missingWithoutTypescript.length > 0 &&
        missingWithoutTypescript.length < deps.missing.length
      ) {
        deps.missing = missingWithoutTypescript
      }
    }

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
              ' file from your package root (and any TypeScript files in your app and pages directories).'
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
      deps = hasNecessaryDependencies(dir, requiredPackages)
    }

    // Load TypeScript after we're sure it exists:
    const tsPackageJsonPath = deps.resolved.get(
      join('typescript', 'package.json')
    )!
    const typescriptPackageJson = require(tsPackageJsonPath)

    const typescriptVersion = typescriptPackageJson.version

    if (semver.lt(typescriptVersion, '5.1.0')) {
      log.warn(
        `Minimum recommended TypeScript version is v5.1.0, older versions can potentially be incompatible with Next.js. Detected: ${typescriptVersion}`
      )
    }

    // Reconfigure (or create) the user's `tsconfig.json` for them:
    await writeConfigurationDefaults(
      typescriptVersion,
      resolvedTsConfigPath,
      intent.firstTimeSetup,
      hasAppDir,
      distDir,
      hasPagesDir,
      strictRouteTypes
    )
    // Write out the necessary `next-env.d.ts` file to correctly register
    // Next.js' types:
    await writeAppTypeDeclarations({
      baseDir: dir,
      distDir,
      distDirRoot,
      imageImportsEnabled: !disableStaticImages,
      hasPagesDir,
      hasAppDir,
    })

    let result
    if (typeCheckPreflight) {
      const { runTypeCheck } =
        require('./typescript/runTypeCheck') as typeof import('./typescript/runTypeCheck')

      const tsPath = deps.resolved.get('typescript')!
      const typescript = (await Promise.resolve(
        require(tsPath)
      )) as typeof import('typescript')

      // Verify the project passes type-checking before we go to webpack phase:
      result = await runTypeCheck(
        typescript,
        dir,
        distDir,
        resolvedTsConfigPath,
        cacheDir,
        hasAppDir,
        { app: appDir, pages: pagesDir },
        debugBuildPaths
      )
    }
    return { result, version: typescriptVersion }
  } catch (err) {
    // These are special errors that should not show a stack trace:
    if (err instanceof CompileError) {
      console.error(red('Failed to type check.\n'))
      console.error(err.message)
      process.exit(1)
    }

    /**
     * verifyTypeScriptSetup can be either invoked directly in the main thread (during next dev / next lint)
     * or run in a worker (during next build). In the latter case, we need to print the error message, as the
     * parent process will only receive an `Jest worker encountered 1 child process exceptions, exceeding retry limit`.
     */

    // we are in a worker, print the error message and exit the process
    if (process.env.IS_NEXT_WORKER) {
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
