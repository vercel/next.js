import type { Env } from '@next/env'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { error } from '../../../build/output/log'

export async function createEnvDefinitions(distDir: string, env: Env) {
  const envKeys = Object.keys(env ?? {})
  if (envKeys.length === 0) {
    return
  }

  const envKeysStr = envKeys
    .map((key) => `      ${key}: readonly string`)
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

  const envDtsPath = join(distDir, 'types', 'env.d.ts')
  try {
    if (!existsSync(dirname(envDtsPath))) {
      await mkdir(dirname(envDtsPath), { recursive: true })
    }
    await writeFile(envDtsPath, definitionStr, 'utf-8')
  } catch (e) {
    error(`Failed to write ${envDtsPath}: ${e}`)
  }
}
