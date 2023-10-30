import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { transform } from './swc'

type Log = {
  error: (...args: any[]) => void
}

const transformOptions = {
  module: {
    type: 'commonjs',
  },
  jsc: {
    target: 'esnext',
    parser: {
      syntax: 'typescript',
    },
  },
  minify: true,
}

export async function compileConfig({
  configPath,
  cwd,
  log,
}: {
  configPath: string
  cwd: string
  log: Log
}): Promise<string> {
  try {
    const config = await readFile(configPath, 'utf-8')
    const { code } = await transform(config, transformOptions)

    const compiledConfigPath = join(cwd, '.next', `next.config.js`)

    await mkdir(join(cwd, '.next'), { recursive: true })
    await writeFile(compiledConfigPath, code, 'utf-8')

    return compiledConfigPath
  } catch (error) {
    log.error(`Failed to compile next.config.ts`)
    throw error
  }
}
