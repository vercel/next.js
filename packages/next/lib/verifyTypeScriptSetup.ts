import chalk from 'chalk'
import path from 'path'
import { FatalTypeScriptError } from './typescript/FatalTypeScriptError'
import { getTypeScriptIntent } from './typescript/getTypeScriptIntent'
import {
  hasNecessaryDependencies,
  NecessaryDependencies,
} from './typescript/hasNecessaryDependencies'
import { runTypeCheck, TypeCheckResult } from './typescript/runTypeCheck'
import { TypeScriptCompileError } from './typescript/TypeScriptCompileError'
import { writeAppTypeDeclarations } from './typescript/writeAppTypeDeclarations'
import { writeConfigurationDefaults } from './typescript/writeConfigurationDefaults'

export async function verifyTypeScriptSetup(
  dir: string,
  pagesDir: string,
  typeCheckPreflight: boolean
): Promise<TypeCheckResult | boolean> {
  const tsConfigPath = path.join(dir, 'tsconfig.json')

  try {
    // Check if the project uses TypeScript:
    const intent = await getTypeScriptIntent(dir, pagesDir)
    if (!intent) {
      return false
    }
    const firstTimeSetup = intent.firstTimeSetup

    // Ensure TypeScript and necessary `@types/*` are installed:
    const deps: NecessaryDependencies = await hasNecessaryDependencies(dir)

    // Load TypeScript after we're sure it exists:
    const ts = (await import(
      deps.resolvedTypeScript
    )) as typeof import('typescript')

    // Reconfigure (or create) the user's `tsconfig.json` for them:
    await writeConfigurationDefaults(ts, tsConfigPath, firstTimeSetup)
    // Write out the necessary `next-env.d.ts` file to correctly register
    // Next.js' types:
    await writeAppTypeDeclarations(dir)

    if (typeCheckPreflight) {
      // Verify the project passes type-checking before we go to webpack phase:
      return await runTypeCheck(ts, dir, tsConfigPath)
    }
    return true
  } catch (err) {
    // These are special errors that should not show a stack trace:
    if (err instanceof TypeScriptCompileError) {
      console.error(chalk.red('Failed to compile.\n'))
      console.error(err.message)
      process.exit(1)
    } else if (err instanceof FatalTypeScriptError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
