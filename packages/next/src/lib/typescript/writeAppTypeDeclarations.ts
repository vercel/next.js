import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'

export async function writeAppTypeDeclarations({
  baseDir,
  distDir,
  distDirRoot,
  imageImportsEnabled,
  hasPagesDir,
  hasAppDir,
}: {
  baseDir: string
  distDir: string
  /** The root dist directory without /dev suffix, used for fixed type paths */
  distDirRoot?: string
  imageImportsEnabled: boolean
  hasPagesDir: boolean
  hasAppDir: boolean
}): Promise<void> {
  // Use distDirRoot for fixed paths in next-env.d.ts, fallback to distDir
  const typesDistDir = distDirRoot ?? distDir
  // Reference `next` types
  const appTypeDeclarations = path.join(baseDir, 'next-env.d.ts')

  // Defaults EOL to system default
  let eol = os.EOL
  let currentContent: string | undefined

  try {
    currentContent = await fs.readFile(appTypeDeclarations, 'utf8')
    // If file already exists then preserve its line ending
    const lf = currentContent.indexOf('\n', /* skip first so we can lf - 1 */ 1)

    if (lf !== -1) {
      if (currentContent[lf - 1] === '\r') {
        eol = '\r\n'
      } else {
        eol = '\n'
      }
    }
  } catch {}

  /**
   * "Triple-slash directives" used to create typings files for Next.js projects
   * using Typescript .
   *
   * @see https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html
   */
  const lines: string[] = [
    // Include the core Next.js typings.
    '/// <reference types="next" />',
  ]

  if (imageImportsEnabled) {
    lines.push('/// <reference types="next/image-types/global" />')
  }

  if (hasAppDir && hasPagesDir) {
    lines.push(
      '/// <reference types="next/navigation-types/compat/navigation" />'
    )
  }

  // Use fixed path for the entry type file (always at .next/types/routes.d.ts)
  // This entry file re-exports from actual type files which may be at different paths
  const routeTypesPath = path.posix.join(
    typesDistDir.replaceAll(path.win32.sep, path.posix.sep),
    'types/routes.d.ts'
  )

  // Use ESM import instead of triple-slash reference for better ESLint compatibility
  lines.push(`import "./${routeTypesPath}";`)

  // Push the notice in.
  lines.push(
    '',
    '// NOTE: This file should not be edited',
    `// see https://nextjs.org/docs/${hasAppDir ? 'app' : 'pages'}/api-reference/config/typescript for more information.`
  )

  const content = lines.join(eol) + eol

  // Avoids an un-necessary write on read-only fs
  if (currentContent === content) {
    return
  }
  await fs.writeFile(appTypeDeclarations, content)
}
