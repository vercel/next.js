import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { transform } from './swc'

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
}): Promise<string> {
  const isCJS = configFileName.endsWith('cts')
  const compiledConfigPath = join(
    cwd,
    '.next',
    `next.config.${isCJS ? 'js' : 'mjs'}`
  )

  try {
    const config = await readFile(configPath, 'utf-8')
    const { code } = await transform(config, {
      module: {
        type: isCJS ? 'commonjs' : 'es6',
      },
      jsc: {
        target: 'esnext',
        parser: {
          syntax: 'typescript',
        },
      },
    })

    await mkdir(join(cwd, '.next'), { recursive: true })
    await writeFile(compiledConfigPath, code, 'utf-8')
  } catch (error) {
    log.error(`Failed to compile ${configFileName}`)
    throw error
  }

  return compiledConfigPath
}
