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
  const delayedModules = new Array<{ depth: number; queue: ModuleIndex[] }>()

  // Initialize queue with active entries
  for (const moduleIndex of activeEntries) {
    depthMap.set(moduleIndex, 0)
  }

  // BFS to compute depth
  // We need to insert new entries into the depth map in monotonic increasing order of depth
  // so that we always process shallower modules before deeper ones
  // This is important to avoid visiting modules multiple times and needing to decrease their depth
  let i = 0
  for (const [moduleIndex, depth] of depthMap) {
    const newDepth = depth + 1
    // Process regular dependencies
    const dependencies = modulesData.moduleDependencies(moduleIndex)
    for (const depIndex of dependencies) {
      if (!depthMap.has(depIndex)) {
        depthMap.set(depIndex, newDepth)
      }
    }

    // Process async dependencies with higher depth penalty
    const asyncDependencies = modulesData.asyncModuleDependencies(moduleIndex)
    for (const depIndex of asyncDependencies) {
      if (!depthMap.has(depIndex)) {
        const newDepth = depth + 1000
        // We can't directly insert async dependencies into the depth map
        // because they might be processed before their parent module
        // leading to incorrect depth assignment.
        // Instead, we queue them to be processed later.
        let delayedQueue = delayedModules.find((dq) => dq.depth === newDepth)
        if (!delayedQueue) {
          delayedQueue = { depth: newDepth, queue: [] }
          delayedModules.push(delayedQueue)
          // Keep delayed queues sorted by depth descending
          delayedModules.sort((a, b) => b.depth - a.depth)
        }
        delayedQueue.queue.push(depIndex)
      }
    }

    i++

    // Check if we need to process the next delayed queue to insert its items into the depth map
    // This happens when we reach the end of the current queue
    // or the next delayed queue has the same depth so its items need to be processed now
    while (
      delayedModules.length > 0 &&
      (i === depthMap.size ||
        newDepth === delayedModules[delayedModules.length - 1].depth)
    ) {
      const { depth, queue } = delayedModules.pop()!
      for (const depIndex of queue) {
        if (!depthMap.has(depIndex)) {
          depthMap.set(depIndex, depth)
        }
      }
    }
  }

  if (delayedModules.length > 0) {
    throw new Error(
      'Internal error: delayed modules remain after BFS processing'
    )
  }

  return depthMap
}
