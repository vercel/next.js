import path from 'path'
import { FatalTypeScriptError } from './typescript/FatalTypeScriptError'
import { getTypeScriptIntent } from './typescript/getTypeScriptIntent'
import {
  hasNecessaryDependencies,
  NecessaryDependencies,
} from './typescript/hasNecessaryDependencies'
import { writeAppTypeDeclarations } from './typescript/writeAppTypeDeclarations'
import { writeConfigurationDefaults } from './typescript/writeConfigurationDefaults'

export async function verifyTypeScriptSetup(
  dir: string,
  pagesDir: string
): Promise<void> {
  const tsConfigPath = path.join(dir, 'tsconfig.json')

  try {
    // Check if the project uses TypeScript:
    const intent = await getTypeScriptIntent(dir, pagesDir)
    if (!intent) {
      return
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
  } catch (err) {
    // This is a special error that should not show its stack trace:
    if (err instanceof FatalTypeScriptError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
