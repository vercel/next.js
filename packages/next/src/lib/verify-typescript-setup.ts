import { bold, cyan, red, yellow } from './picocolors'
import path from 'path'

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
import {
  getTypeScriptApiMissingError,
  getTypeScriptPackageInfo,
  hasNativeTypeScriptPreview,
} from './typescript/runTypeScriptCli'

const typescriptApiPackage: MissingDependency = {
  file: 'typescript/lib/typescript.js',
  pkg: 'typescript',
  install: 'typescript@^6.0.0',
  exportsRestrict: true,
}

const typescriptCliPackage: MissingDependency = {
  file: 'typescript/bin/tsc',
  pkg: 'typescript',
  exportsRestrict: true,
}

const requiredTypePackages: MissingDependency[] = [
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

export async function verifyAndRunTypeScript({
  dir,
  distDir,
  cacheDir,
  strictRouteTypes,
  tsconfigPath,
  shouldRunTypeCheck,
  typedRoutes,
  disableStaticImages,
  hasAppDir,
  hasPagesDir,
  appDir,
  pagesDir,
  debugBuildPaths,
  useTypeScriptCli = false,
}: {
  dir: string
  distDir: string
  cacheDir?: string
  strictRouteTypes: boolean
  tsconfigPath: string | undefined
  shouldRunTypeCheck: boolean
  typedRoutes: boolean
  disableStaticImages: boolean
  hasAppDir: boolean
  hasPagesDir: boolean
  appDir?: string
  pagesDir?: string
  debugBuildPaths?: { app?: string[]; pages?: string[] }
  useTypeScriptCli?: boolean
}): Promise<{
  result?: TypeCheckResult
  version: string | null
  typeCheckMode: 'typescript-api' | 'typescript-cli'
}> {
  const tsConfigFileName = tsconfigPath || 'tsconfig.json'
  const resolvedTsConfigPath = path.join(dir, tsConfigFileName)
  const typeCheckMode = useTypeScriptCli ? 'typescript-cli' : 'typescript-api'

  // Construct intentDirs from appDir and pagesDir for getTypeScriptIntent
  const intentDirs = [pagesDir, appDir].filter(Boolean) as string[]

  try {
    // Check if the project uses TypeScript:
    const intent = await getTypeScriptIntent(dir, intentDirs, tsConfigFileName)
    if (!intent) {
      return { version: null, typeCheckMode }
    }

    // Check if @typescript/native-preview is installed as an alternative
    const hasNativePreview = hasNativeTypeScriptPreview(dir)
    const installedTypeScript = getTypeScriptPackageInfo(dir)

    if (
      !useTypeScriptCli &&
      !hasNativePreview &&
      installedTypeScript &&
      !installedTypeScript.apiPath
    ) {
      throw getTypeScriptApiMissingError(installedTypeScript.version)
    }

    const requiredPackages: MissingDependency[] = [
      useTypeScriptCli ? typescriptCliPackage : typescriptApiPackage,
      ...requiredTypePackages,
    ]

    // Ensure TypeScript and necessary `@types/*` are installed:
    let deps: NecessaryDependencies = hasNecessaryDependencies(
      dir,
      requiredPackages
    )

    // If @typescript/native-preview is installed and only the typescript package is missing,
    // we can skip auto-installing typescript since the native preview provides TS compilation.
    // However, we still need @types/react and @types/node for type checking.
    if (!useTypeScriptCli && hasNativePreview && deps.missing?.length > 0) {
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
          imageImportsEnabled: !disableStaticImages,
          hasPagesDir,
          hasAppDir,
          strictRouteTypes,
          typedRoutes,
        })

        return { version: null, typeCheckMode }
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

    const typeScriptPackage = getTypeScriptPackageInfo(dir)
    const typeScriptPath = useTypeScriptCli
      ? typeScriptPackage?.tscPath
      : typeScriptPackage?.apiPath

    if (!typeScriptPackage || !typeScriptPath) {
      missingDepsError(
        dir,
        deps.missing.length > 0
          ? deps.missing
          : [useTypeScriptCli ? typescriptCliPackage : typescriptApiPackage]
      )
    }

    const typescriptVersion = typeScriptPackage.version

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
      imageImportsEnabled: !disableStaticImages,
      hasPagesDir,
      hasAppDir,
      strictRouteTypes,
      typedRoutes,
    })

    let result
    if (shouldRunTypeCheck) {
      if (useTypeScriptCli) {
        if (debugBuildPaths) {
          log.warn(
            '`experimental.useTypeScriptCli` checks the complete TypeScript project; `--debug-build-paths` does not limit type checking.'
          )
        }

        const { runTypeCheckCli } =
          require('./typescript/runTypeCheckCli') as typeof import('./typescript/runTypeCheckCli')
        result = await runTypeCheckCli({
          baseDir: dir,
          tsConfigPath: resolvedTsConfigPath,
          tscPath: typeScriptPath,
          cacheDir,
        })
      } else {
        const { runTypeCheck } =
          require('./typescript/runTypeCheck') as typeof import('./typescript/runTypeCheck')
        // Install native bindings so that code frame rendering works in the worker
        const { installBindings } =
          require('../build/swc/install-bindings') as typeof import('../build/swc/install-bindings')
        await installBindings()

        const typescript = (await Promise.resolve(
          require(typeScriptPath)
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
    }
    return { result, version: typescriptVersion, typeCheckMode }
  } catch (err) {
    // These are special errors that should not show a stack trace:
    if (err instanceof CompileError) {
      console.error(red('Failed to type check.\n'))
      if (err.message) {
        console.error(err.message)
      }
      process.exit(1)
    }

    /**
     * verifyAndRunTypeScript can be either invoked directly in the main thread (during next dev / next lint)
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
