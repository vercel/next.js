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

// Jest use the `vm` [Module API](https://nodejs.org/api/vm.html#vm_class_vm_module) for ESM.
// see https://github.com/facebook/jest/issues/9430
const isSupportEsm = 'Module' in vm

module.exports = {
  createTransformer: (inputOptions) => ({
    process(src, filename, jestOptions) {
      const jestConfig = getJestConfig(jestOptions)

      let swcTransformOpts = getJestSWCOptions({
        // When target is node it's similar to the server option set in SWC.
        isServer:
          jestConfig.testEnvironment && jestConfig.testEnvironment === 'node',
        filename,
        nextConfig: inputOptions.nextConfig,
        jsConfig: inputOptions.jsConfig,
        resolvedBaseUrl: inputOptions.resolvedBaseUrl,
        pagesDir: inputOptions.pagesDir,
        esm:
          isSupportEsm &&
          isEsm(Boolean(inputOptions.isEsmProject), filename, jestConfig),
      })

      return transformSync(src, { ...swcTransformOpts, filename })
    },
  }),
}

function getJestConfig(jestConfig) {
  return 'config' in jestConfig
    ? // jest 27
      jestConfig.config
    : // jest 26
      jestConfig
}

function isEsm(isEsmProject, filename, jestConfig) {
  return (
    (/\.jsx?$/.test(filename) && isEsmProject) ||
    jestConfig.extensionsToTreatAsEsm?.find((ext) => filename.endsWith(ext))
  )
}
