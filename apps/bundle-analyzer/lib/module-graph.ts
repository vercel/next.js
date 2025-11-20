import type { AnalyzeData, ModuleIndex, ModulesData } from './analyze-data'

/**
 * Compute active entries from the current route's sources.
 *
 * It's a heuristic approach that looks for known entry module idents
 * and traces their dependencies to find active modules.
 *
 * I don't like it as it has too much assumptions about next.js internals.
 * It would be better if the source map contains idents instead of only paths.
 */
export function computeActiveEntries(
  modulesData: ModulesData,
  analyzeData: AnalyzeData
): ModuleIndex[] {
  const potentialEntryDependents = [
    'next/dist/esm/build/templates/pages.js',
    'next/dist/esm/build/templates/pages-api.js',
    'next/dist/esm/build/templates/pages-edge-api.js',
    'next/dist/esm/build/templates/edge-ssr.js',
    'next/dist/esm/build/templates/app-route.js',
    'next/dist/esm/build/templates/edge-app-route.js',
    'next/dist/esm/build/templates/app-page.js',
    'next/dist/esm/build/templates/edge-ssr-app.js',
    'next/dist/esm/build/templates/middleware.js',
    '[next]/entry/page-loader.ts',
  ]
  const potentialEntries = [
    'next/dist/client/app-next-turbopack.js',
    'next/dist/client/next-turbopack.js',
  ]

  const activeEntries = new Set<ModuleIndex>()

  for (
    let moduleIndex = 0;
    moduleIndex < modulesData.moduleCount();
    moduleIndex++
  ) {
    const ident = modulesData.module(moduleIndex)!.ident

    if (
      potentialEntryDependents.some((entryIdent) => ident.includes(entryIdent))
    ) {
      const dependencies = modulesData.moduleDependencies(moduleIndex)
      for (const dep of dependencies) {
        const path = modulesData.module(dep)!.path
        if (path.includes('next/dist/')) {
          continue
        }
        const source = analyzeData.getSourceIndexFromPath(path)
        if (source !== undefined) {
          activeEntries.add(dep)
        }
      }
    }
    if (potentialEntries.some((entryIdent) => ident.includes(entryIdent))) {
      activeEntries.add(moduleIndex)
    }
  }

  return Array.from(activeEntries)
}

/**
 * Compute module depth from active entries using BFS
 * Returns a Map from ModuleIndex to depth
 * Unreachable modules will not have an entry in the map
 */
export function computeModuleDepthMap(
  modulesData: ModulesData,
  activeEntries: ModuleIndex[]
): Map<ModuleIndex, number> {
  const depthMap = new Map<ModuleIndex, number>()
  const queue: Array<{ moduleIndex: ModuleIndex; depth: number }> = []

  // Initialize queue with active entries
  for (const moduleIndex of activeEntries) {
    if (!depthMap.has(moduleIndex)) {
      depthMap.set(moduleIndex, 0)
      queue.push({ moduleIndex, depth: 0 })
    }
  }

  // BFS to compute depth
  while (queue.length > 0) {
    const { moduleIndex, depth } = queue.shift()!

    // Process regular dependencies
    const dependencies = modulesData.moduleDependencies(moduleIndex)
    for (const depIndex of dependencies) {
      if (!depthMap.has(depIndex)) {
        const newDepth = depth + 1
        depthMap.set(depIndex, newDepth)
        queue.push({ moduleIndex: depIndex, depth: newDepth })
      }
    }

    // Process async dependencies with higher depth penalty
    const asyncDependencies = modulesData.asyncModuleDependencies(moduleIndex)
    for (const depIndex of asyncDependencies) {
      if (!depthMap.has(depIndex)) {
        const newDepth = depth + 1000
        depthMap.set(depIndex, newDepth)
        queue.push({ moduleIndex: depIndex, depth: newDepth })
      }
    }
  }

  return depthMap
}
