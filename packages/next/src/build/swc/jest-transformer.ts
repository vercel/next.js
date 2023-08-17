/*
Copyright (c) 2021 The swc Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

import vm from 'vm'
import { transformSync } from './index'
import { getJestSWCOptions } from './options'
import * as docblock from 'next/dist/compiled/jest-docblock'
import type {
  TransformerCreator,
  TransformOptions,
  SyncTransformer,
} from '@jest/transform'
import type { Config } from '@jest/types'
import type { NextConfig, ExperimentalConfig } from '../../server/config-shared'

type TransformerConfig = Config.TransformerConfig[1]
export interface JestTransformerConfig extends TransformerConfig {
  jsConfig: any
  resolvedBaseUrl?: string
  pagesDir?: string
  hasServerComponents?: boolean
  isEsmProject: boolean
  modularizeImports?: NextConfig['modularizeImports']
  swcPlugins: ExperimentalConfig['swcPlugins']
  compilerOptions: NextConfig['compiler']
}

// Jest use the `vm` [Module API](https://nodejs.org/api/vm.html#vm_class_vm_module) for ESM.
// see https://github.com/facebook/jest/issues/9430
const isSupportEsm = 'Module' in vm

function getJestConfig(
  jestConfig: TransformOptions<JestTransformerConfig>
): Config.ProjectConfig {
  return 'config' in jestConfig
    ? // jest 27
      jestConfig.config
    : // jest 26
      (jestConfig as unknown as Config.ProjectConfig)
}

function isEsm(
  isEsmProject: boolean,
  filename: string,
  jestConfig: Config.ProjectConfig
): boolean {
  return (
    (/\.jsx?$/.test(filename) && isEsmProject) ||
    jestConfig.extensionsToTreatAsEsm?.some((ext: any) =>
      filename.endsWith(ext)
    )
  )
}

function getTestEnvironment(
  src: string,
  jestConfig: Config.ProjectConfig
): string {
  const docblockPragmas = docblock.parse(docblock.extract(src))
  const pragma = docblockPragmas['jest-environment']
  const environment =
    (Array.isArray(pragma) ? pragma[0] : pragma) ?? jestConfig.testEnvironment
  return environment
}

const createTransformer: TransformerCreator<
  SyncTransformer<JestTransformerConfig>,
  JestTransformerConfig
> = (inputOptions) => ({
  process(src, filename, jestOptions) {
    const jestConfig = getJestConfig(jestOptions)
    const testEnvironment = getTestEnvironment(src, jestConfig)

    const swcTransformOpts = getJestSWCOptions({
      // When target is node it's similar to the server option set in SWC.
      isServer:
        testEnvironment === 'node' ||
        testEnvironment.includes('jest-environment-node'),
      filename,
      jsConfig: inputOptions?.jsConfig,
      resolvedBaseUrl: inputOptions?.resolvedBaseUrl,
      pagesDir: inputOptions?.pagesDir,
      hasServerComponents: inputOptions?.hasServerComponents,
      modularizeImports: inputOptions?.modularizeImports,
      swcPlugins: inputOptions?.swcPlugins,
      compilerOptions: inputOptions?.compilerOptions,
      esm:
        isSupportEsm &&
        isEsm(Boolean(inputOptions?.isEsmProject), filename, jestConfig),
    })

    return transformSync(src, { ...swcTransformOpts, filename })
  },
})

module.exports = { createTransformer }
