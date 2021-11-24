import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileExists } from '../file-exists'

export async function writeAppTypeDeclarations(baseDir: string): Promise<void> {
  // Reference `next` types
  const appTypeDeclarations = path.join(baseDir, 'next-env.d.ts')
  const hasAppTypeDeclarations = await fileExists(appTypeDeclarations)
  if (!hasAppTypeDeclarations) {
    await fs.writeFile(
      appTypeDeclarations,
      '/// <reference types="next" />' +
        os.EOL +
        '/// <reference types="next/types/global" />' +
        os.EOL
    )
  }
}
