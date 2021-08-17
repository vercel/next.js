import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileExists } from '../file-exists'

export async function writeAppTypeDeclarations(
  baseDir: string,
  imageImportsEnabled: boolean
): Promise<void> {
  // Reference `next` types
  const appTypeDeclarations = path.join(baseDir, 'next-env.d.ts')

  const content =
    '/// <reference types="next" />' +
    os.EOL +
    '/// <reference types="next/types/global" />' +
    os.EOL +
    (imageImportsEnabled
      ? '/// <reference types="next/image-types/global" />' + os.EOL
      : '') +
    os.EOL +
    '// NOTE: This file should not be edited' +
    os.EOL +
    '// see https://nextjs.org/docs/basic-features/typescript for more information.' +
    os.EOL

  // Avoids a write for read-only filesystems
  if (
    (await fileExists(appTypeDeclarations)) &&
    (await fs.readFile(appTypeDeclarations, 'utf8')) === content
  ) {
    return
  }

  await fs.writeFile(appTypeDeclarations, content)
}
