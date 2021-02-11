import chalk from 'chalk'
import path from 'path'
import { FatalTypeScriptError } from './typescript/FatalTypeScriptError'
import { getTypeScriptIntent } from './typescript/getTypeScriptIntent'
import {
  checkDependencies,
  getPackageInstallCommand,
} from './check-dependencies'
import { runTypeCheck, TypeCheckResult } from './typescript/runTypeCheck'
import { TypeScriptCompileError } from './typescript/TypeScriptCompileError'
import { writeAppTypeDeclarations } from './typescript/writeAppTypeDeclarations'
import { writeConfigurationDefaults } from './typescript/writeConfigurationDefaults'
import { getOxfordCommaList } from './oxford-comma-list'

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
    const { resolvedPackagesMap, missingDependencies } = checkDependencies(
      dir,
      [
        { filename: 'typescript', packageName: 'typescript' },
        { filename: '@types/react/index.d.ts', packageName: '@types/react' },
        { filename: '@types/node/index.d.ts', packageName: '@types/node' },
      ]
    )
    if (missingDependencies.length) {
      const names = missingDependencies.map(
        (dependency) => dependency.packageName
      )
      throw new FatalTypeScriptError(
        chalk.bold(
          chalk.red(
            `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
          ) +
            `\n\nPlease install ${getOxfordCommaList(names)} by running:` +
            '\n\n\t' +
            chalk.cyan(
              (await getPackageInstallCommand(dir)) + ' ' + names.join(' ')
            ) +
            `\n\nIf you are not trying to use TypeScript, please remove the ${chalk.cyan(
              'tsconfig.json'
            )} file from your package root (and any TypeScript files in your pages directory).\n`
        )
      )
    }

    // Load TypeScript after we're sure it exists:
    const ts = (await import(
      resolvedPackagesMap.get('typescript')!
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
