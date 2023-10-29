import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { transform } from './swc'

export async function compileConfig({
  configPath,
  cwd,
}: {
  configPath: string
  cwd: string
}): Promise<string> {
  const compiledConfigPath = join(cwd, '.next', 'next.config.mjs')

  try {
    const config = await readFile(configPath, 'utf-8')
    const { code } = await transform(config, {
      jsc: {
        target: 'esnext',
        parser: {
          syntax: 'typescript',
        },
      },
      minify: true,
    })

    await mkdir(join(cwd, '.next'), { recursive: true })
    await writeFile(compiledConfigPath, code, 'utf-8')

    return compiledConfigPath
  } catch (error) {
    console.error(`Failed to compile next.config.ts: ${error}`)
    throw error
  }
}
