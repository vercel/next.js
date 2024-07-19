import type { Env } from '@next/env'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

export async function createEnvDefinitions({
  distDir,
  env,
}: {
  distDir: string
  env: Env
}) {
  const envKeysStr = Object.keys(env)
    .map((key) => `      ${key}?: string`)
    .join('\n')

  const definitionStr = `// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
${envKeysStr}
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
