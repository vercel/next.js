import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { recursiveReadDir } from '../recursive-readdir'

export type TypeScriptIntent = { firstTimeSetup: boolean }

export async function getTypeScriptIntent(
  baseDir: string,
  intentDirs: string[],
  tsconfigPath: string
): Promise<TypeScriptIntent | false> {
  const resolvedTsConfigPath = path.join(baseDir, tsconfigPath)

  // The integration turns on if we find a `tsconfig.json` in the user's
  // project.
  const hasTypeScriptConfiguration = existsSync(resolvedTsConfigPath)
  if (hasTypeScriptConfiguration) {
    const content = readFileSync(resolvedTsConfigPath, {
      encoding: 'utf8',
    }).trim()

    return { firstTimeSetup: content === '' || content === '{}' }
  }

  // Next.js also offers a friendly setup mode that bootstraps a TypeScript
  // project for the user when we detect TypeScript files. So, we need to check
  // the `pages/` directory for a TypeScript file.
  // Checking all directories is too slow, so this is a happy medium.
  // String checks instead of regular expressions: these run for every file.
  for (const dir of intentDirs) {
    const typescriptFiles = await recursiveReadDir(dir, {
      pathnameFilter: (name) => name.endsWith('.ts') || name.endsWith('.tsx'),
      ignoreFilter: (name) =>
        name.includes('node_modules') || name.endsWith('.d.ts'),
    })
    if (typescriptFiles.length) {
      return { firstTimeSetup: true }
    }
  }

  return false
}
