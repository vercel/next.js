import { promises as fs } from 'fs'
import path from 'path'
import { fileExists } from '../file-exists'
import { recursiveReadDir } from '../recursive-readdir'

export type TypeScriptIntent = { firstTimeSetup: boolean }

export async function getTypeScriptIntent(
  baseDir: string,
  pagesDir: string
): Promise<TypeScriptIntent | false> {
  const tsConfigPath = path.join(baseDir, 'tsconfig.json')

  // The integration turns on if we find a `tsconfig.json` in the user's
  // project.
  const hasTypeScriptConfiguration = await fileExists(tsConfigPath)
  if (hasTypeScriptConfiguration) {
    const content = await fs.readFile(tsConfigPath, { encoding: 'utf8' }).then(
      (txt) => txt.trim(),
      () => null
    )
    return { firstTimeSetup: content === '' || content === '{}' }
  }

  // Next.js also offers a friendly setup mode that bootstraps a TypeScript
  // project for the user when we detect TypeScript files. So, we need to check
  // the `pages/` directory for a TypeScript file.
  // Checking all directories is too slow, so this is a happy medium.
  const typescriptFiles = await recursiveReadDir(
    pagesDir,
    /.*\.(ts|tsx)$/,
    /(node_modules|.*\.d\.ts)/
  )
  if (typescriptFiles.length) {
    return { firstTimeSetup: true }
  }

  return false
}
