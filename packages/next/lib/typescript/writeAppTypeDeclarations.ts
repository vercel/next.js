import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

export async function writeAppTypeDeclarations(
  baseDir: string,
  imageImportsEnabled: boolean
): Promise<void> {
  // Reference `next` types
  const appTypeDeclarations = path.join(baseDir, 'next-env.d.ts')

  await fs.writeFile(
    appTypeDeclarations,
    '/// <reference types="next" />' +
      os.EOL +
      '/// <reference types="next/types/global" />' +
      os.EOL +
      (imageImportsEnabled
        ? '/// <reference types="next/image-types/global" />' + os.EOL
        : '')
  )
}
