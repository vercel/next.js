import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Options } from '@swc/core'

export function resolveSWCOptions({ tsConfig }: { tsConfig: any }): Options {
  const baseSWCOptions: Options = {
    jsc: {
      target: 'es5',
      parser: {
        syntax: 'typescript',
      },
    },
    module: {
      type: 'commonjs',
    },
    isModule: 'unknown',
  }

  // See https://github.com/vercel/next.js/pull/57656#issuecomment-1962359584
  // const swcOptions: Options = {
  //   ...baseSWCOptions,
  //   jsc: {
  //     ...baseSWCOptions.jsc,
  //     baseUrl: tempResolveBase,
  //     paths: tsConfig.compilerOptions?.paths,
  //   },
  // }

  return baseSWCOptions
}

export async function getModuleType(
  cwd: string
): Promise<'commonjs' | 'module'> {
  // TODO: Use dynamic import when repo TS upgraded >= 5.3
  let packageJson: any
  try {
    packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {}

  if (packageJson.type === 'module') {
    return 'module'
  }

  return 'commonjs'
}

export const hasImportOrRequire = async (nextConfigPath: string) => {
  const content = await readFile(nextConfigPath, 'utf8')
  return /import|require/.test(content)
}
