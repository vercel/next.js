import type { webpack } from 'next/dist/compiled/webpack/webpack'
import loaderUtils from 'next/dist/compiled/loader-utils3'
import { relative } from 'path'

function formatModule(compiler: webpack.Compiler, module: any) {
  const relativePath = relative(compiler.context, module.resource).replace(
    /\?.+$/,
    ''
  )
  return loaderUtils.isUrlRequest(relativePath)
    ? loaderUtils.urlToRequest(relativePath)
    : relativePath
}

export function formatModuleTrace(
  compiler: webpack.Compiler,
  moduleTrace: any[]
) {
  let importTrace: string[] = []
  let firstExternalModule: any
  for (let i = moduleTrace.length - 1; i >= 0; i--) {
    const mod = moduleTrace[i]
    if (!mod.resource) continue

    if (!mod.resource.includes('node_modules/')) {
      importTrace.unshift(formatModule(compiler, mod))
    } else {
      firstExternalModule = mod
      break
    }
  }

  let invalidImportMessage = ''
  if (firstExternalModule) {
    const firstExternalPackageName =
      firstExternalModule.resourceResolveData?.descriptionFileData?.name

    if (firstExternalPackageName === 'styled-jsx') {
      invalidImportMessage += `\n\nThe error was caused by using 'styled-jsx' in '${importTrace[0]}'. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
    } else {
      let formattedExternalFile =
        firstExternalModule.resource.split('node_modules')
      formattedExternalFile =
        formattedExternalFile[formattedExternalFile.length - 1]

      invalidImportMessage += `\n\nThe error was caused by importing '${formattedExternalFile.slice(
        1
      )}' in '${importTrace[0]}'.`
    }
  }

  return {
    lastInternalFileName: importTrace[0],
    invalidImportMessage,
    formattedModuleTrace: importTrace.map((mod) => '  ' + mod).join('\n'),
  }
}

export function getModuleTrace(
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

  return {
    moduleTrace,
    isPagesDir,
  }
}
