import { transformSync } from '../swc'
import type { Options } from '@swc/core'

export function registerTransform(
  swcOptions: Options,
  originalRequireHook: NodeJS.RequireExtensions['.js'],
  extensions: string[]
) {
  for (const ext of extensions) {
    require.extensions[ext] = function (m: any, originalFileName) {
      const _compile = m._compile

      m._compile = function (code: string, filename: string) {
        const swc = transformSync(code, swcOptions)
        return _compile.call(this, swc.code, filename)
      }

      return originalRequireHook(m, originalFileName)
    }
  }
}
