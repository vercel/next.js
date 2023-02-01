import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { relative } from 'path'

export function getImportTrace(
  module: any,
  compilation: webpack.Compilation,
  compiler: webpack.Compiler
) {
  // Get the module trace:
  // https://cs.github.com/webpack/webpack/blob/9fcaa243573005d6fdece9a3f8d89a0e8b399613/lib/stats/DefaultStatsFactoryPlugin.js#L414
  const visitedModules = new Set()
  const moduleTrace = []

  let current = module
  let isPagesDir = false
  while (current) {
    if (visitedModules.has(current)) break
    if (/[\\/]pages/.test(current.resource.replace(compiler.context, ''))) {
      isPagesDir = true
    }
    visitedModules.add(current)
    moduleTrace.push(current)
    const origin = compilation.moduleGraph.getIssuer(current)
    if (!origin) break
    current = origin
  }

  const importTrace = moduleTrace
    .map((m) =>
      m.resource
        ? '  ' + relative(compiler.context, m.resource).replace(/\?.+$/, '')
        : ''
    )
    .filter(Boolean)

  return {
    importTrace,
    isPagesDir,
  }
}
