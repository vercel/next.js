import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { transform } from './swc'

async function getModuleType(
  cwd: string,
  log: any
): Promise<string | undefined> {
  try {
    const tsconfig = await import(join(cwd, 'tsconfig.json'), {
      assert: { type: 'json' },
    })

    // We do not verify typescript setup here
    // If missing any of the required options, we will proceed with esm
    // If missing a tsconfig.json, we will throw an error
    return tsconfig?.default.compilerOptions?.module?.toLowerCase()
  } catch (error) {
    log.error(`Failed to read tsconfig.json`)
    throw error
  }
}

export async function compileConfig({
  configPath,
  cwd,
  log,
}: {
  configPath: string
  cwd: string
  log: any
}): Promise<string> {
  try {
    const config = await readFile(configPath, 'utf-8')
    const module = await getModuleType(cwd, log)
    const isNotCommonJS = module !== 'commonjs'
    const compiledConfigPath = join(
      cwd,
      '.next',
      `next.config.${isNotCommonJS && 'm'}js`
    )
    const { code } = await transform(config, {
      module: {
        type: isNotCommonJS ? 'es6' : 'commonjs',
      },
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
    log.error(`Failed to compile next.config.ts`)
    throw error
  }
}
