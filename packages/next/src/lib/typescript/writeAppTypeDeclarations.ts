import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'

export async function writeAppTypeDeclarations(
  baseDir: string,
  imageImportsEnabled: boolean
): Promise<void> {
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
  } catch (err) {}

  const content =
    '/// <reference types="next" />' +
    eol +
    (imageImportsEnabled
      ? '/// <reference types="next/image-types/global" />' + eol
      : '') +
    eol +
    '// NOTE: This file should not be edited' +
    eol +
    '// see https://nextjs.org/docs/basic-features/typescript for more information.' +
    eol

  // Avoids an un-necessary write on read-only fs
  if (currentContent === content) {
    return
  }
  await fs.writeFile(appTypeDeclarations, content)
}
