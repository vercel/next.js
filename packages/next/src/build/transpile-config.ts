import { readFile } from 'fs/promises'
import { transform } from './swc'

type Log = {
  error: (message: string) => void
}

export async function transpileConfig({
  configPath,
  configFileName,
  log,
}: {
  configPath: string
  configFileName: string
  cwd: string
  log: Log
}) {
  try {
    const nextConfig = await readFile(configPath, 'utf-8')
    const { code } = await transform(nextConfig, {
      jsc: {
        target: 'esnext',
        parser: {
          syntax: 'typescript',
        },
      },
      isModule: 'unknown',
    })

    return code
  } catch (error) {
    log.error(`Failed to compile ${configFileName}`)
    throw error
  }
}
