import type { Options as SWCOptions } from '@swc/core'
import Module from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { warnOnce } from '../output/log'

const oldJSHook = require.extensions?.['.js']
const extensions = ['.ts', '.cts', '.mts', '.cjs', '.mjs']

export function registerHook(swcOptions: SWCOptions) {
  // require.extensions is undefined on Node 24.15+ under Yarn PnP, where the
  // bridged require has no `.extensions` property. We can't install handlers
  // in that case, so warn the user once so a silent failure to load
  // TypeScript inside next.config.ts (e.g. `require('./helper.ts')`) is at
  // least diagnosable, and bail.
  if (!require.extensions || !oldJSHook) {
    if (!require.extensions) {
      warnOnce(
        'next.config.ts: require.extensions is unavailable on this Node.js version under Yarn PnP. ' +
          'TypeScript files imported via require() inside next.config.ts will fail to load. ' +
          'Workaround: convert require() to import, or pin Node.js < 24.15.'
      )
    }
    return
  }

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
  if (!require.extensions || !oldJSHook) return
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
