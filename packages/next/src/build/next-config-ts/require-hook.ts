import type { Options as SWCOptions } from '@swc/core'
import Module from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

const oldJSHook = require.extensions['.js']
const extensions = ['.ts', '.cts', '.mts', '.cjs', '.mjs']

export function registerHook(swcOptions: SWCOptions) {
  // lazy require swc since it loads React before even setting NODE_ENV
  // resulting loading Development React on Production
  const { transformSync } = require('../swc') as typeof import('../swc')

  require.extensions['.js'] = function (mod: any, oldFilename) {
    try {
      return oldJSHook(mod, oldFilename)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ERR_REQUIRE_ESM') {
        throw error
      }

      // calling oldJSHook throws ERR_REQUIRE_ESM, so run _compile manually
      // TODO: investigate if we can remove readFileSync
      const content = readFileSync(oldFilename, 'utf8')
      const { code } = transformSync(content, swcOptions)
      mod._compile(code, oldFilename)
    }
  }

  for (const ext of extensions) {
    const oldHook = require.extensions[ext] ?? oldJSHook
    require.extensions[ext] = function (mod: any, oldFilename) {
      const _compile = mod._compile

      mod._compile = function (code: string, filename: string) {
        const swc = transformSync(code, swcOptions)
        return _compile.call(this, swc.code, filename)
      }

      return oldHook(mod, oldFilename)
    }
  }
}

export function deregisterHook() {
  require.extensions['.js'] = oldJSHook
  extensions.forEach((ext) => delete require.extensions[ext])
}

export function requireFromString(code: string, filename: string) {
  const paths = (Module as any)._nodeModulePaths(dirname(filename))
  const m = new Module(filename, module.parent!) as any
  m.paths = paths
  m._compile(code, filename)
  return m.exports
}
