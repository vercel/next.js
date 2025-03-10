import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'

export async function writeAppTypeDeclarations({
  baseDir,
  imageImportsEnabled,
  hasPagesDir,
  hasAppDir,
}: {
  baseDir: string
  imageImportsEnabled: boolean
  hasPagesDir: boolean
  hasAppDir: boolean
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
  const directives: string[] = [
    // Include the core Next.js typings.
    '/// <reference types="next" />',
  ]

  if (imageImportsEnabled) {
    directives.push('/// <reference types="next/image-types/global" />')
  }

  if (hasAppDir && hasPagesDir) {
    directives.push(
      '/// <reference types="next/navigation-types/compat/navigation" />'
    )
  }

  // Push the notice in.
  directives.push(
    '',
    '// NOTE: This file should not be edited',
    `// see https://nextjs.org/docs/${hasAppDir ? 'app' : 'pages'}/api-reference/config/typescript for more information.`
  )

  const content = directives.join(eol) + eol

  // Avoids an un-necessary write on read-only fs
  if (currentContent === content) {
    return
  }
  await fs.writeFile(appTypeDeclarations, content)
}
