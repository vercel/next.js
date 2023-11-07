import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { transform } from './swc'

type Log = {
  error: (message: string) => void
}

const transformOptions = {
  module: {
    type: 'commonjs',
    strict: true,
  },
  jsc: {
    target: 'esnext',
    parser: {
      syntax: 'typescript',
    },
  },
  minify: true,
}

export async function transpileConfig({
  configPath,
  cwd,
  log,
}: {
  configPath: string
  cwd: string
  log: Log
}): Promise<string> {
  const compiledConfigPath = join(cwd, '.next', `next.config.js`)

  try {
    const config = await readFile(configPath, 'utf-8')
    const { code } = await transform(config, transformOptions)

    await mkdir(join(cwd, '.next'), { recursive: true })
    await writeFile(compiledConfigPath, code, 'utf-8')
  } catch (error) {
    log.error(`Failed to compile next.config.ts`)
    throw error
  }

  return compiledConfigPath
}
