'use client'

import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Route,
  Server,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AnalyzeData, ModulesData } from '@/lib/analyze-data'

interface ImportChainProps {
  startFileId: number
  analyzeData: AnalyzeData
  modulesData: ModulesData
  filterSource?: (sourceIndex: number) => boolean
}

interface ChainLevel {
  fileId: number
  filePath: string
  fileDepth: number
  selectedIndex: number
  totalCount: number
  // Info about this level's relationship to parent (undefined for root)
  info?: DependentInfo
  // All available dependents at this level
  allDependents?: DependentInfo[]
}

interface DependentInfo {
  moduleIndex: number
  sourceIndex: number | undefined
  isAsync: boolean
  depth: number
  flags:
    | {
        client: boolean
        server: boolean
        traced: boolean
        js: boolean
        css: boolean
        json: boolean
        asset: boolean
      }
    | undefined
}

function getPathDifference(currentPath: string, previousPath: string | null) {
  if (!previousPath) {
    return { common: '', different: currentPath }
  }

  const currentSegments = currentPath.split('/')
  const previousSegments = previousPath.split('/')

  let commonCount = 0
  const minLength = Math.min(currentSegments.length, previousSegments.length)

  for (let i = 0; i < minLength; i++) {
    if (currentSegments[i] === previousSegments[i]) {
      commonCount++
    } else {
      break
    }
  }

  const commonSegments = currentSegments.slice(0, commonCount)
  const differentSegments = currentSegments.slice(commonCount)

  return {
    common: commonSegments.length > 0 ? `${commonSegments.join('/')}/` : '',
    different: differentSegments.join('/'),
  }
}

const insertLineBreaks = (path: string) => {
  const segments = path.split('/')
  return segments.map((segment, i) => (
    <span
      key={`${segment}-${i}`}
      className={segment.length > 20 ? 'break-all' : ''}
    >
      {segment}
      {i < segments.length - 1 && '/'}
      <wbr />
    </span>
  ))
}

export function ImportChain({
  startFileId,
  analyzeData,
  modulesData,
}: ImportChainProps) {
  // Track which dependent is selected at each level
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])

  // Helper function to get module index from source path
  const getModuleIndexFromSourceIndex = (sourceIndex: number) => {
    const path = analyzeData.getFullSourcePath(sourceIndex)
    return modulesData.getModuleIndexFromPath(path)
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

    // Get the module index for the starting source
    const startModuleIndex = getModuleIndexFromSourceIndex(startFileId)
    if (startModuleIndex === undefined) return result

    result.push({
      fileId: startFileId,
      filePath: startPath,
      fileDepth: modulesData.module(startModuleIndex)?.depth ?? Infinity,
      selectedIndex: 0,
      totalCount: 1,
    })

    visitedModules.add(startModuleIndex)

    // Build chain by following selected dependents
    let levelIndex = 0
    let currentModuleIndex = startModuleIndex

    while (true) {
      // Get dependents at the module level (sync and async)
      const dependentModuleIndices = [
        ...modulesData
          .moduleDependents(currentModuleIndex)
          .map((index: number) => ({ index, async: false })),
        ...modulesData
          .asyncModuleDependents(currentModuleIndex)
          .map((index: number) => ({ index, async: true })),
      ]

      // Filter out dependents that would create a cycle
      const validDependents = dependentModuleIndices.filter(
        ({ index }) => !visitedModules.has(index)
      )

      if (validDependents.length === 0) {
        // No more dependents or all would create cycles
        break
      }

      // Build info for each dependent
      const dependentsInfo: DependentInfo[] = validDependents.map(
        ({ index: moduleIndex, async: isAsync }) => {
          const module = modulesData.module(moduleIndex)
          const sourceIndex = getSourceIndexFromModuleIndex(moduleIndex)
          const flags =
            sourceIndex !== undefined
              ? analyzeData.getSourceFlags(sourceIndex)
              : undefined
          return {
            moduleIndex,
            sourceIndex,
            isAsync,
            depth: module?.depth ?? Infinity,
            flags,
          }
        }
      )

      // Sort: sync first, async second, then by source presence, then by depth
      dependentsInfo.sort((a, b) => {
        // First sort by async state (sync before async)
        if (a.isAsync !== b.isAsync) {
          return a.isAsync ? 1 : -1
        }

        // Then sort by source presence (with source before without)
        const aHasSource = a.sourceIndex !== undefined
        const bHasSource = b.sourceIndex !== undefined
        if (aHasSource !== bHasSource) {
          return aHasSource ? -1 : 1
        }

        // Finally sort by depth (smallest first)
        return a.depth - b.depth
      })

      // Get the selected index for this level (default to 0)
      const selectedIdx = selectedIndices[levelIndex] ?? 0
      const actualIdx = Math.min(selectedIdx, dependentsInfo.length - 1)

      const selectedDepInfo = dependentsInfo[actualIdx]
      const selectedDepModule = modulesData.module(selectedDepInfo.moduleIndex)

      if (!selectedDepModule) break

      result.push({
        fileId: selectedDepInfo.moduleIndex,
        filePath: selectedDepModule.path,
        fileDepth: selectedDepModule.depth,
        selectedIndex: actualIdx,
        totalCount: dependentsInfo.length,
        info: selectedDepInfo,
        allDependents: dependentsInfo,
      })

      visitedModules.add(selectedDepInfo.moduleIndex)
      currentModuleIndex = selectedDepInfo.moduleIndex
      levelIndex++

      // Safety check to prevent infinite loops
      if (levelIndex > 100) break
    }

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFileId, analyzeData, modulesData, selectedIndices])

  const handlePrevious = (levelIndex: number) => {
    setSelectedIndices((prev) => {
      const newIndices = [...prev]
      const currentIdx = newIndices[levelIndex] ?? 0
      const level = chain[levelIndex + 1] // Fixed: use levelIndex + 1 to get the correct level
      newIndices[levelIndex] =
        currentIdx > 0 ? currentIdx - 1 : level.totalCount - 1
      return newIndices.slice(0, levelIndex + 1)
    })
  }

  const handleNext = (levelIndex: number) => {
    setSelectedIndices((prev) => {
      const newIndices = [...prev]
      const currentIdx = newIndices[levelIndex] ?? 0
      const level = chain[levelIndex + 1] // Fixed: use levelIndex + 1 to get the correct level
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
          const previousPath = index > 0 ? chain[index - 1].filePath : null
          const { common, different } = getPathDifference(
            level.filePath,
            previousPath
          )

          // Get the current item's info from the level itself
          const currentItemInfo = level.info

          return (
            <div key={`${level.filePath}-${index}`}>
              <div className="flex items-center gap-2">
                <div className="flex-1 border border-border rounded px-2 py-1 bg-background">
                  <span
                    className="font-mono text-xs text-foreground text-center block break-words"
                    title={level.filePath}
                  >
                    {index === 0 ? (
                      <span className="font-normal">
                        {insertLineBreaks(level.filePath)}
                      </span>
                    ) : (
                      <>
                        {common && (
                          <span className="font-normal text-muted-foreground/60">
                            {insertLineBreaks(common)}
                          </span>
                        )}
                        <span className="font-bold">
                          {insertLineBreaks(different)}
                        </span>
                      </>
                    )}
                  </span>
                </div>

                {/* Show icons for current item if we have flag info or no source */}
                {currentItemInfo && (
                  <div className="flex flex-col gap-1 items-center">
                    {currentItemInfo.sourceIndex === undefined && (
                      <div title="Used only on different route">
                        <Route className="w-3 h-3 text-amber-500" />
                      </div>
                    )}
                    {currentItemInfo.flags?.client ? (
                      <div title="Client Component">
                        <Monitor className="w-3 h-3 text-green-500" />
                      </div>
                    ) : currentItemInfo.flags?.server ? (
                      <div title="Server Component">
                        <Server className="w-3 h-3 text-blue-500" />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {index < chain.length - 1 &&
                (() => {
                  // Get the info for the next item (the one the arrow points to)
                  const nextItemInfo = chain[index + 1].info

                  return (
                    <div className="flex items-center justify-center gap-2 py-1">
                      <ArrowUp
                        className="w-4 h-4 text-muted-foreground"
                        strokeDasharray={
                          nextItemInfo?.isAsync ? '4,4' : undefined
                        }
                      />
                      {chain[index + 1].totalCount > 1 && (
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
                            {chain[index + 1].selectedIndex + 1}/
                            {chain[index + 1].totalCount}
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
                  )
                })()}
            </div>
          )
        })}
        {chain.length === 0 && (
          <p className="text-muted-foreground italic text-xs">
            No dependents found
          </p>
        )}
      </div>
    </div>
  )
}
