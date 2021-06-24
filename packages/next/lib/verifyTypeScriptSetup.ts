import chalk from 'chalk'
import path from 'path'
import {
  hasNecessaryDependencies,
  NecessaryDependencies,
} from './has-necessary-dependencies'
import semver from 'next/dist/compiled/semver'
import { CompileError } from './compile-error'
import { FatalError } from './fatal-error'
import * as log from '../build/output/log'

import { getTypeScriptIntent } from './typescript/getTypeScriptIntent'
import { TypeCheckResult } from './typescript/runTypeCheck'
import { writeAppTypeDeclarations } from './typescript/writeAppTypeDeclarations'
import { writeConfigurationDefaults } from './typescript/writeConfigurationDefaults'

export async function verifyTypeScriptSetup(
  dir: string,
  pagesDir: string,
  typeCheckPreflight: boolean,
  imageImportsEnabled: boolean,
  cacheDir?: string
): Promise<{ result?: TypeCheckResult; version: string | null }> {
  const tsConfigPath = path.join(dir, 'tsconfig.json')

  try {
    // Check if the project uses TypeScript:
    const intent = await getTypeScriptIntent(dir, pagesDir)
    if (!intent) {
      return { version: null }
    }
    const firstTimeSetup = intent.firstTimeSetup

    // Ensure TypeScript and necessary `@types/*` are installed:
    const deps: NecessaryDependencies = await hasNecessaryDependencies(
      dir,
      !!intent,
      false
    )

    // Load TypeScript after we're sure it exists:
    const ts = (await import(
      deps.resolved.get('typescript')!
    )) as typeof import('typescript')

    if (semver.lt(ts.version, '4.3.2')) {
      log.warn(
        `Minimum recommended TypeScript version is v4.3.2, older versions can potentially be incompatible with Next.js. Detected: ${ts.version}`
      )
    }

    // Reconfigure (or create) the user's `tsconfig.json` for them:
    await writeConfigurationDefaults(ts, tsConfigPath, firstTimeSetup)
    // Write out the necessary `next-env.d.ts` file to correctly register
    // Next.js' types:
    await writeAppTypeDeclarations(dir, imageImportsEnabled)

    let result
    if (typeCheckPreflight) {
      const { runTypeCheck } = require('./typescript/runTypeCheck')

      // Verify the project passes type-checking before we go to webpack phase:
      result = await runTypeCheck(ts, dir, tsConfigPath, cacheDir)
    }
    return { result, version: ts.version }
  } catch (err) {
    // These are special errors that should not show a stack trace:
    if (err instanceof CompileError) {
      console.error(chalk.red('Failed to compile.\n'))
      console.error(err.message)
      process.exit(1)
    } else if (err instanceof FatalError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
