import type { LoadedEnvFiles } from '@next/env'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

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
    const typesDir = join(distDir, 'types')
    await mkdir(typesDir, { recursive: true })
    await writeFile(join(typesDir, 'env.d.ts'), definitionStr, 'utf-8')
  } catch (e) {
    console.error('Failed to write env.d.ts:', e)
  }
}
