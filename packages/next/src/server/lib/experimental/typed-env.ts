import type { Env } from '@next/env'
import { dirname, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

export async function createEnvDefinitions(distDir: string, env: Env) {
  const envKeys = Object.keys(env ?? {})
    .map((key) => `      ${key}: readonly string`)
    .join('\n')
  const definitionStr = `// Type definitions for Next.js environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
${envKeys}
    }
  }
}
export {}`

  const envDtsPath = join(distDir, 'types', 'env.d.ts')
  try {
    await mkdir(dirname(envDtsPath), { recursive: true })
    await writeFile(envDtsPath, definitionStr, 'utf-8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      await writeFile(envDtsPath, definitionStr, 'utf-8')
    }

    console.error(`Failed to write ${envDtsPath}: ${error}`)
  }
}
