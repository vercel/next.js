import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'

export async function writeAppTypeDeclarations({
  baseDir,
  distDir,
  imageImportsEnabled,
  hasPagesDir,
  hasAppDir,
  strictRouteTypes,
  typedRoutes,
}: {
  baseDir: string
  distDir: string
  imageImportsEnabled: boolean
  hasPagesDir: boolean
  hasAppDir: boolean
  strictRouteTypes: boolean
  typedRoutes: boolean
}): Promise<void> {
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

  const routeTypesPath = path.posix.join(
    distDir.replaceAll(path.win32.sep, path.posix.sep),
    'types/routes.d.ts'
  )

  // Use ESM import instead of triple-slash reference for better ESLint compatibility
  lines.push(`import "./${routeTypesPath}";`)

  if (strictRouteTypes) {
    const cacheLifePath = path.posix.join(
      distDir.replaceAll(path.win32.sep, path.posix.sep),
      'types/cache-life.d.ts'
    )
    lines.push(`import "./${cacheLifePath}";`)

    const routeValidatorPath = path.posix.join(
      distDir.replaceAll(path.win32.sep, path.posix.sep),
      'types/validator.ts'
    )
    lines.push(`import "./${routeValidatorPath}";`)

    if (typedRoutes === true) {
      const linkTypesPath = path.posix.join(
        distDir.replaceAll(path.win32.sep, path.posix.sep),
        'types/link.d.ts'
      )
      lines.push(`import "./${linkTypesPath}";`)
    }
  }

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
