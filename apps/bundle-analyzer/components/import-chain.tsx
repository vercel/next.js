'use client'

import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Box,
  File,
  PanelTop,
  SquareFunction,
  Server,
  Globe,
  MessageCircleQuestion,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  AnalyzeData,
  ModuleIndex,
  ModulesData,
  SourceIndex,
} from '@/lib/analyze-data'
import { splitIdent } from '@/lib/utils'
import clsx from 'clsx'

interface ImportChainProps {
  startFileId: number
  analyzeData: AnalyzeData
  modulesData: ModulesData
  depthMap: Map<ModuleIndex, number>
  environmentFilter: 'client' | 'server'
}

interface ChainLevel {
  moduleIndex: ModuleIndex
  sourceIndex: SourceIndex | undefined
  path: string
  depth: number
  fullPath?: string
  templateArgs?: string
  layer?: string
  moduleType?: string
  treeShaking?: string
  selectedIndex: number
  totalCount: number
  // Info about this level's relationship to parent (undefined for root)
  info?: DependentInfo
}

interface DependentInfo {
  moduleIndex: number
  sourceIndex: number | undefined
  ident: string
  isAsync: boolean
  depth: number
}

type PathPart = {
  segment: string
  isCommon: boolean
  isLastCommon: boolean
  isPackageName: boolean
  isInfrastructure: boolean
}

function spitPathSegments(path: string): string[] {
  return Array.from(path.matchAll(/(.+?(?:\/|$))/g)).map(([i]) => i)
}

function getPathParts(
  currentPath: string,
  previousPath: string | null
): PathPart[] {
  const currentSegments = spitPathSegments(currentPath)

  let commonCount = 0
  if (previousPath) {
    const previousSegments = spitPathSegments(previousPath)

    const minLength = Math.min(currentSegments.length, previousSegments.length)

    for (let i = 0; i < minLength; i++) {
      if (currentSegments[i] === previousSegments[i]) {
        commonCount++
      } else {
        break
      }
    }
  }

  let infrastructureCount = 0
  let packageNameCount = 0
  let nodeModulesIndex = currentSegments.lastIndexOf('node_modules/')
  if (nodeModulesIndex === -1) {
    nodeModulesIndex = currentSegments.length
  } else {
    infrastructureCount = nodeModulesIndex + 1
    if (currentSegments[nodeModulesIndex + 1]?.startsWith('@')) {
      packageNameCount = 2
    } else {
      packageNameCount = 1
    }
  }

  return currentSegments.map((segment, i) => ({
    segment,
    isCommon: i < commonCount,
    isLastCommon: i === commonCount - 1,
    isInfrastructure: i < infrastructureCount,
    isPackageName:
      i >= infrastructureCount && i < infrastructureCount + packageNameCount,
  }))
}

function getTitle(level: ChainLevel) {
  const parts = []
  if (level.fullPath) parts.push(`Full Path: ${level.fullPath}`)
  else parts.push(`Path: ${level.path}`)
  if (level.layer) parts.push(`Layer: ${level.layer}`)
  if (level.moduleType) parts.push(`Module Type: ${level.moduleType}`)
  if (level.treeShaking) parts.push(`Tree Shaking: ${level.treeShaking}`)
  if (level.templateArgs) parts.push(`Template Args: ${level.templateArgs}`)
  return parts.join('\n')
}

export function ImportChain({
  startFileId,
  analyzeData,
  modulesData,
  depthMap,
  environmentFilter,
}: ImportChainProps) {
  // Filter to include only the current route
  const [showAll, setShowAll] = useState(false)

  // Track which dependent is selected at each level
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])

  // Helper function to get module indices from source path
  const getModuleIndicesFromSourceIndex = (sourceIndex: number) => {
    const path = analyzeData.getFullSourcePath(sourceIndex)
    return modulesData.getModuleIndiciesFromPath(path)
  }

  // Helper function to get source index from module path
  const getSourceIndexFromModuleIndex = (moduleIndex: number) => {
    const module = modulesData.module(moduleIndex)
    if (!module) return undefined

    // Search through all sources to find one with matching path
    const modulePath = module.path
    for (let i = 0; i < analyzeData.sourceCount(); i++) {
      if (analyzeData.getFullSourcePath(i) === modulePath) {
        return i
      }
    }
    return undefined
  }

  // Build the import chain based on current selections
  const chain = useMemo(() => {
    const result: ChainLevel[] = []
    const visitedModules = new Set<number>()

    const startPath = analyzeData.getFullSourcePath(startFileId)
    if (!startPath) return result

    // Get all module indices for the starting source
    const startModuleIndices = getModuleIndicesFromSourceIndex(
      startFileId
    ).filter((moduleIndex) => {
      if (!showAll && !depthMap.has(moduleIndex)) {
        return false
      }
      let module = modulesData.module(moduleIndex)
      let layer = splitIdent(module?.ident || '').layer
      if (layer) {
        if (environmentFilter === 'client' && /ssr|rsc|route|api/.test(layer)) {
          return false
        }
        if (environmentFilter === 'server' && /client/.test(layer)) {
          return false
        }
      }
      return true
    })
    if (startModuleIndices.length === 0) return result

    // Get the selected index for the start modules (default to 0)
    const selectedStartIdx = selectedIndices[0] ?? 0
    const actualStartIdx = Math.min(
      selectedStartIdx,
      startModuleIndices.length - 1
    )
    const startModuleIndex = startModuleIndices[actualStartIdx]
    const startIdent = modulesData.module(startModuleIndex)?.ident ?? ''

    result.push({
      moduleIndex: startModuleIndex,
      sourceIndex: startFileId,
      path: startPath,
      ...splitIdent(startIdent),
      depth: depthMap.get(startModuleIndex) ?? Infinity,
      selectedIndex: actualStartIdx,
      totalCount: startModuleIndices.length,
    })

    visitedModules.add(startModuleIndex)

    // Build chain by following selected dependents
    let levelIndex = 1
    let currentModuleIndex = startModuleIndex

    while (true) {
      // Get dependents at the module level (sync and async)
      const dependentModuleIndices = [
        ...modulesData
          .moduleDependents(currentModuleIndex)
          .map((index: number) => ({
            index,
            async: false,
            depth: depthMap.get(index) ?? Infinity,
          })),
        ...modulesData
          .asyncModuleDependents(currentModuleIndex)
          .map((index: number) => ({
            index,
            async: true,
            depth: depthMap.get(index) ?? Infinity,
          })),
      ]

      // Filter out dependents that would create a cycle
      const validDependents = dependentModuleIndices.filter(
        ({ index, depth }) =>
          !visitedModules.has(index) && (isFinite(depth) || showAll)
      )

      if (validDependents.length === 0) {
        // No more dependents or all would create cycles
        break
      }

      // Build info for each dependent
      const dependentsInfo: DependentInfo[] = validDependents.map(
        ({ index: moduleIndex, async: isAsync, depth }) => {
          const sourceIndex = getSourceIndexFromModuleIndex(moduleIndex)
          let ident = modulesData.module(moduleIndex)?.ident || ''
          return {
            moduleIndex,
            sourceIndex,
            ident,
            isAsync,
            depth,
          }
        }
      )

      // Sort: sync first, async second, then by source presence, then by depth
      dependentsInfo.sort((a, b) => {
        // Sort by depth (smallest first)
        if (a.depth !== b.depth) {
          return a.depth - b.depth
        }
        // Sort by ident length (shortest first)
        if (a.ident.length !== b.ident.length) {
          return a.ident.length - b.ident.length
        }
        // Sort by ident
        return a.ident.localeCompare(b.ident)
      })

      // Get the selected index for this level (default to 0)
      const selectedIdx = selectedIndices[levelIndex] ?? 0
      const actualIdx = Math.min(selectedIdx, dependentsInfo.length - 1)

      const selectedDepInfo = dependentsInfo[actualIdx]
      const selectedDepModule = modulesData.module(selectedDepInfo.moduleIndex)

      if (!selectedDepModule) break

      result.push({
        moduleIndex: selectedDepInfo.moduleIndex,
        sourceIndex: selectedDepInfo.sourceIndex,
        path: selectedDepModule.path,
        depth: depthMap.get(selectedDepInfo.moduleIndex) ?? Infinity,
        ...splitIdent(selectedDepModule.ident),
        selectedIndex: actualIdx,
        totalCount: dependentsInfo.length,
        info: selectedDepInfo,
      })

      visitedModules.add(selectedDepInfo.moduleIndex)
      currentModuleIndex = selectedDepInfo.moduleIndex
      levelIndex++

      // Safety check to prevent infinite loops
      if (levelIndex > 100) break
    }

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startFileId,
    analyzeData,
    modulesData,
    selectedIndices,
    showAll,
    depthMap,
    environmentFilter,
  ])

  const handlePrevious = (levelIndex: number) => {
    setSelectedIndices((prev) => {
      const newIndices = [...prev]
      const currentIdx = newIndices[levelIndex] ?? 0
      const level = chain[levelIndex]
      newIndices[levelIndex] =
        currentIdx > 0 ? currentIdx - 1 : level.totalCount - 1
      return newIndices.slice(0, levelIndex + 1)
    })
  }

  const handleNext = (levelIndex: number) => {
    setSelectedIndices((prev) => {
      const newIndices = [...prev]
      const currentIdx = newIndices[levelIndex] ?? 0
      const level = chain[levelIndex]
      newIndices[levelIndex] =
        currentIdx < level.totalCount - 1 ? currentIdx + 1 : 0
      return newIndices.slice(0, levelIndex + 1)
    })
  }

  const startPath = analyzeData.getFullSourcePath(startFileId)
  if (!startPath) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-foreground">Import chain</h3>
      <div className="space-y-0">
        {chain.map((level, index) => {
          const previousPath = index > 0 ? chain[index - 1].path : null
          const parts = getPathParts(level.path, previousPath)

          const flags =
            level.sourceIndex !== undefined
              ? analyzeData.getSourceFlags(level.sourceIndex)
              : undefined

          // Get the current item's info from the level itself
          const currentItemInfo = level.info

          return (
            <div key={`${level.path}-${index}`}>
              {currentItemInfo?.isAsync && <div className="h-8" />}
              <div className="flex items-center justify-center gap-2 py-1">
                {currentItemInfo?.isAsync && (
                  <span className="text-xs text-muted-foreground italic">
                    (async)
                  </span>
                )}
                {index > 0 ? (
                  <ArrowUp className="w-4 h-4 text-muted-foreground" />
                ) : undefined}
                {level.totalCount > 1 && (
                  <div className="flex items-center gap-1 flex-none">
                    <button
                      type="button"
                      onClick={() => handlePrevious(index)}
                      className="p-0.5 hover:bg-accent rounded transition-colors cursor-pointer"
                      title="Previous dependent"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span className="text-muted-foreground text-xs min-w-[3ch] text-center">
                      {level.selectedIndex + 1}/{level.totalCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNext(index)}
                      className="p-0.5 hover:bg-accent rounded transition-colors cursor-pointer"
                      title="Next dependent"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {currentItemInfo?.isAsync && <div className="h-8" />}
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1 items-center">
                  {!level.layer ? (
                    <div title="Unknown">
                      <MessageCircleQuestion className="w-3 h-3 text-gray-500" />
                    </div>
                  ) : /app/.test(level.layer || '') ? (
                    <div title="App Router">
                      <Box className="w-3 h-3 text-green-500" />
                    </div>
                  ) : (
                    <div title="Pages Router">
                      <File className="w-3 h-3 text-purple-500" />
                    </div>
                  )}
                </div>

                <div className="flex-1 border border-border rounded px-2 py-1 bg-background">
                  <span
                    className="font-mono text-xs text-foreground text-center block break-words"
                    title={getTitle(level)}
                  >
                    {parts.map(
                      (
                        {
                          segment,
                          isCommon,
                          isLastCommon,
                          isInfrastructure,
                          isPackageName,
                        },
                        i
                      ) => (
                        <span
                          key={i}
                          className={clsx(
                            segment.length > 20 && 'break-all',
                            isCommon &&
                              !isLastCommon &&
                              !isPackageName &&
                              !isInfrastructure &&
                              'text-muted-foreground/80',
                            !isCommon && !isInfrastructure && 'font-bold',
                            isInfrastructure && 'text-muted-foreground/50',
                            isPackageName && 'text-orange-500'
                          )}
                        >
                          {segment}
                          <wbr />
                        </span>
                      )
                    )}
                  </span>
                </div>

                {/* Show icons for current item if we have flag info or no source */}
                <div className="flex flex-col gap-1 items-center">
                  {/client/.test(level.layer || '') &&
                    (flags?.client ? (
                      <div title="Included on client-side of this route">
                        <PanelTop className="w-3 h-3 text-green-500" />
                      </div>
                    ) : (
                      <div title="On client layer, but not included on client-side of this route (might be optimized away)">
                        <PanelTop className="w-3 h-3 text-gray-500" />
                      </div>
                    ))}
                  {/ssr/.test(level.layer || '') &&
                    (flags?.server ? (
                      <div title="Included on server-side of this route for server-side rendering">
                        <Globe className="w-3 h-3 text-blue-500" />
                      </div>
                    ) : (
                      <div title="On server-side rendering layer, but not included on server-side of this route (might be optimized away)">
                        <Globe className="w-3 h-3 text-gray-500" />
                      </div>
                    ))}
                  {/rsc/.test(level.layer || '') &&
                    (flags?.server ? (
                      <div title="Included on server-side of this route as Server Component">
                        <Server className="w-3 h-3 text-orange-500" />
                      </div>
                    ) : (
                      <div title="On Server Component layer, but not included on server-side of this route (might be optimized away)">
                        <Server className="w-3 h-3 text-gray-500" />
                      </div>
                    ))}
                  {/route|api/.test(level.layer || '') &&
                    (flags?.server ? (
                      <div title="Included on server-side of this route for API routes">
                        <SquareFunction className="w-3 h-3 text-red-500" />
                      </div>
                    ) : (
                      <div title="On API route layer, but not included on server-side of this route (might be optimized away)">
                        <SquareFunction className="w-3 h-3 text-gray-500" />
                      </div>
                    ))}
                </div>
              </div>

              <div className="block text-center">
                {level.treeShaking && (
                  <div className="text-xs text-foreground text-center">
                    {level.treeShaking === 'locals'
                      ? '(local declarations only)'
                      : level.treeShaking === 'module evaluation'
                        ? '(only the module evaluation part of the module)'
                        : `(${level.treeShaking})`}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {chain.length === 0 && (
          <p className="text-muted-foreground italic text-xs">
            No dependents found
          </p>
        )}
      </div>
      <div className="pt-2">
        <label className="inline-flex items-center space-x-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="form-checkbox h-4 w-4 text-primary"
            checked={showAll}
            onChange={() => setShowAll((prev) => !prev)}
          />
          <span>
            Show all dependents (including those outside current route)
          </span>
        </label>
      </div>
    </div>
  )
}
