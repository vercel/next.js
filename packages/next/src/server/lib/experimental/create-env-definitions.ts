import type { LoadedEnvFiles } from '@next/env'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

export async function createEnvDefinitions({
  distDir,
  loadedEnvFiles,
}: {
  distDir: string
  loadedEnvFiles: LoadedEnvFiles
}) {
  const envLines = []
  const seenKeys = new Set()
  // env files are in order of priority
  for (const { path, env } of loadedEnvFiles) {
    for (const key in env) {
      if (!seenKeys.has(key)) {
        envLines.push(`      /** Loaded from \`${path}\` */`)
        envLines.push(`      ${key}?: string`)
        seenKeys.add(key)
      }
    }
  }
  const envStr = envLines.join('\n')

  const definitionStr = `// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
${envStr}
    }
  }
}
export {}`

  if (process.env.NODE_ENV === 'test') {
    return definitionStr
  }

  try {
    // we expect the types directory to already exist
    const envDtsPath = join(distDir, 'types', 'env.d.ts')
    // do not await, this is not essential for further process
    writeFile(envDtsPath, definitionStr, 'utf-8')
  } catch (e) {
    console.error('Failed to write env.d.ts:', e)
  }
}
