import { readFile, writeFile } from 'fs/promises'
import { transform } from './swc'
import { join } from 'path'

type Log = {
  error: (message: string) => void
}

export async function transpileConfig({
  configPath,
  configFileName,
  cwd,
  log,
}: {
  configPath: string
  configFileName: string
  cwd: string
  log: Log
}) {
  const isCJS = configFileName.endsWith('.cts')
  try {
    const config = await readFile(configPath, 'utf-8')
    const { code } = await transform(config, {
      jsc: {
        target: 'esnext',
        parser: {
          syntax: 'typescript',
        },
      },
      isModule: 'unknown',
    })

    const tempConfigPath = join(
      cwd,
      `next.compiled.config.${isCJS ? 'cjs' : 'mjs'}`
    )
    await writeFile(tempConfigPath, code, 'utf-8')

    return tempConfigPath
  } catch (error) {
    log.error(`Failed to compile ${configFileName}`)
    throw error
  }
}
