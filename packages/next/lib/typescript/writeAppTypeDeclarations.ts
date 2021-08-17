import { constants as FS, promises as fs } from 'fs'
import os from 'os'
import path from 'path'

export async function writeAppTypeDeclarations(
  baseDir: string,
  imageImportsEnabled: boolean
): Promise<void> {
  // Reference `next` types
  const appTypeDeclarations = path.join(baseDir, 'next-env.d.ts')

  // Defaults EOL to system default
  let eol = os.EOL

  try {
    await fs.access(appTypeDeclarations, FS.F_OK)
    const buffer = await fs.readFile(appTypeDeclarations)
    const fileContent = buffer.toString()

    // If file already exists then preserve its line ending
    const lf = fileContent.indexOf('\n', /* skip first so we can lf - 1 */ 1)

    if (lf !== -1) {
      if (fileContent[lf - 1] === '\r') {
        eol = '\r\n'
      } else {
        eol = '\n'
      }
    }
  } catch (err) {}

  await fs.writeFile(
    appTypeDeclarations,
    '/// <reference types="next" />' +
      eol +
      '/// <reference types="next/types/global" />' +
      eol +
      (imageImportsEnabled
        ? '/// <reference types="next/image-types/global" />' + eol
        : '') +
      eol +
      '// NOTE: This file should not be edited' +
      eol +
      '// see https://nextjs.org/docs/basic-features/typescript for more information.' +
      eol
  )
}
