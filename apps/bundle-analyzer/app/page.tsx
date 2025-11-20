'use client'

import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { ImportChain } from '@/components/import-chain'
import { ErrorState } from '@/components/error-state'
import {
  RouteTypeahead,
  type RouteTypeaheadRef,
} from '@/components/route-typeahead'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

import { Input } from '@/components/ui/input'
import { Skeleton, TreemapSkeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import { SpecialModule } from '@/lib/types'
import { getSpecialModuleType, fetchStrict } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function Home() {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [environmentFilter, setEnvironmentFilter] = useState<string>('client')
  const [typeFilter, setTypeFilter] = useState<string[]>(['js', 'css', 'json'])
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(
    null
  )
  const [focusedSourceIndex, setFocusedSourceIndex] = useState<number | null>(
    null
  )

  const {
    data: modulesData,
    isLoading: isModulesLoading,
    error: modulesError,
  } = useSWR<ModulesData>('data/modules.data', fetchModulesData)

  let analyzeDataPath
  if (selectedRoute && selectedRoute === '/') {
    analyzeDataPath = 'data/analyze.data'
  } else if (selectedRoute) {
    analyzeDataPath = `data/${selectedRoute.replace(/^\//, '')}/analyze.data`
  } else {
    analyzeDataPath = null
  }

  const {
    data: analyzeData,
    isLoading: isAnalyzeLoading,
    error: analyzeError,
  } = useSWR<AnalyzeData>(analyzeDataPath, fetchAnalyzeData, {
    onSuccess: (newData) => {
      const newRootSourceIndex = getRootSourceIndex(newData)
      setSelectedSourceIndex(newRootSourceIndex)
      setFocusedSourceIndex(newRootSourceIndex)
    },
  })

  const [sidebarWidth, setSidebarWidth] = useState(20) // percentage
  const [isResizing, setIsResizing] = useState(false)
  const [isMouseInTreemap, setIsMouseInTreemap] = useState(false)
  const [hoveredNodeInfo, setHoveredNodeInfo] = useState<{
    name: string
    server?: boolean
    client?: boolean
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const routeTypeaheadRef = useRef<RouteTypeaheadRef>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to focus route filter
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        routeTypeaheadRef.current?.focus()
      }
      // / to focus search (only if not already in an input)
      else if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const filterSource = useMemo(() => {
    if (!analyzeData) return undefined

    return (sourceIndex: number) => {
      const flags = analyzeData.getSourceFlags(sourceIndex)

      // Check environment filter
      const hasEnvironment =
        (environmentFilter === 'client' && flags.client) ||
        (environmentFilter === 'server' && flags.server)

      // Check type filter
      const hasType =
        (typeFilter.includes('js') && flags.js) ||
        (typeFilter.includes('css') && flags.css) ||
        (typeFilter.includes('json') && flags.json) ||
        (typeFilter.includes('asset') && flags.asset)

      return hasEnvironment && hasType
    }
  }, [analyzeData, environmentFilter, typeFilter])

  const handleMouseDown = () => {
    setIsResizing(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isResizing) return
    const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100
    setSidebarWidth(Math.max(10, Math.min(50, newWidth))) // Clamp between 10% and 50%
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  const error = analyzeError || modulesError
  const isAnyLoading = isAnalyzeLoading || isModulesLoading
  const rootSourceIndex = getRootSourceIndex(analyzeData)

  const specialModuleType = getSpecialModuleType(
    analyzeData,
    selectedSourceIndex
  )

  return (
    <main
      className="h-screen flex flex-col bg-background"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="flex-none px-4 py-2 border-b border-border flex items-center gap-4">
        <div className="basis-1/3 flex">
          <RouteTypeahead
            ref={routeTypeaheadRef}
            selectedRoute={selectedRoute}
            onRouteSelected={(route) => {
              setSelectedRoute(route)
              setSelectedSourceIndex(null)
              setFocusedSourceIndex(null)
            }}
          />
        </div>

        <div className="basis-2/3 flex justify-end">
          {analyzeData && (
            <>
              <ToggleGroup
                type="single"
                className="mr-4"
                value={environmentFilter}
                onValueChange={(value) => {
                  if (value) setEnvironmentFilter(value)
                }}
                size="sm"
              >
                <ToggleGroupItem value="client">Client</ToggleGroupItem>
                <ToggleGroupItem value="server">Server</ToggleGroupItem>
              </ToggleGroup>

              <ToggleGroup
                type="multiple"
                className="mr-4"
                value={typeFilter}
                onValueChange={(value) => {
                  if (value.length > 0) setTypeFilter(value)
                }}
                size="sm"
              >
                <ToggleGroupItem value="js">JS</ToggleGroupItem>
                <ToggleGroupItem value="css">CSS</ToggleGroupItem>
                <ToggleGroupItem value="json">JSON</ToggleGroupItem>
                <ToggleGroupItem value="asset">Asset</ToggleGroupItem>
              </ToggleGroup>

              {!searchFocused && (
                <div className="flex items-center gap-4 text-xs">
                  <p className="text-muted-foreground">
                    {
                      analyzeData.source(focusedSourceIndex ?? rootSourceIndex)
                        ?.path
                    }
                  </p>
                </div>
              )}

              <Input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search files..."
                className="w-48 focus:w-80 transition-all duration-200"
              />
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {error && !analyzeData ? (
          <ErrorState error={error} />
        ) : isAnyLoading ? (
          <>
            <div className="flex-1 min-w-0 p-4 bg-background">
              <TreemapSkeleton />
            </div>

            <button
              type="button"
              className="flex-none w-1 bg-border cursor-col-resize transition-colors"
              disabled
              aria-label="Resize sidebar"
            />

            <div
              className="flex-none bg-muted border-l border-border overflow-y-auto"
              style={{ width: `${sidebarWidth}%` }}
            >
              <div className="flex-1 p-3 space-y-4 overflow-y-auto">
                <h2 className="text-xs font-semibold mb-2 text-foreground">
                  Selected Source
                </h2>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            </div>
          </>
        ) : analyzeData ? (
          <>
            <div className="flex-1 min-w-0">
              <TreemapVisualizer
                analyzeData={analyzeData}
                sourceIndex={rootSourceIndex}
                selectedSourceIndex={selectedSourceIndex ?? rootSourceIndex}
                onSelectSourceIndex={setSelectedSourceIndex}
                focusedSourceIndex={focusedSourceIndex ?? rootSourceIndex}
                onFocusSourceIndex={setFocusedSourceIndex}
                isMouseInTreemap={isMouseInTreemap}
                onMouseInTreemapChange={setIsMouseInTreemap}
                onHoveredNodeChange={setHoveredNodeInfo}
                searchQuery={searchQuery}
                filterSource={filterSource}
              />
            </div>

            <button
              type="button"
              className="flex-none w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
              onMouseDown={handleMouseDown}
              aria-label="Resize sidebar"
            />

            <div
              className="flex-none bg-muted border-l border-border overflow-y-auto"
              style={{ width: `${sidebarWidth}%` }}
            >
              <div className="flex-1 p-3 space-y-4 overflow-y-auto">
                <h2 className="text-xs font-semibold mb-2 text-foreground">
                  Selected Source
                </h2>

                {selectedSourceIndex != null &&
                  analyzeData.source(selectedSourceIndex) && (
                    <>
                      <dl className="space-y-2">
                        <div>
                          <dt className="text-xs text-muted-foreground inline">
                            Output Size:{' '}
                          </dt>
                          <dd className="text-xs text-muted-foreground inline">
                            {formatBytes(
                              analyzeData.getSourceOutputSize(
                                selectedSourceIndex
                              )
                            )}
                          </dd>
                        </div>
                        {(specialModuleType === SpecialModule.POLYFILL_MODULE ||
                          specialModuleType ===
                            SpecialModule.POLYFILL_NOMODULE) && (
                          <div className="flex items-center gap-2">
                            <dt className="inline-flex items-center rounded-md bg-polyfill/10 dark:bg-polyfill/30 px-2 py-1 text-xs font-medium text-polyfill dark:text-polyfill-foreground ring-1 ring-inset ring-polyfill/20 shrink-0">
                              Polyfill
                            </dt>
                            <dd className="text-xs text-muted-foreground">
                              Next.js built-in polyfills
                              {specialModuleType ===
                              SpecialModule.POLYFILL_NOMODULE ? (
                                <>
                                  . <code>polyfill-nomodule.js</code> is only
                                  sent to legacy browsers.
                                </>
                              ) : null}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {modulesData && (
                        <ImportChain
                          key={selectedSourceIndex}
                          startFileId={selectedSourceIndex}
                          analyzeData={analyzeData}
                          modulesData={modulesData}
                          filterSource={filterSource}
                        />
                      )}
                      {(() => {
                        const chunks =
                          analyzeData.sourceChunks(selectedSourceIndex)
                        if (chunks.length > 0) {
                          return (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-foreground">
                                Output Chunks:
                              </p>
                              <ul className="text-xs text-muted-foreground font-mono mt-1 space-y-1">
                                {chunks.map((chunk) => (
                                  <li key={chunk} className="break-all">
                                    {chunk}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </>
                  )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {analyzeData && (
        <div className="flex-none border-t border-border bg-background px-4 py-2 h-10">
          <p className="text-sm text-muted-foreground">
            {hoveredNodeInfo ? (
              <>
                <span className="font-medium text-foreground">
                  {hoveredNodeInfo.name}
                </span>
                {(hoveredNodeInfo.server || hoveredNodeInfo.client) && (
                  <span className="ml-2 text-xs">
                    {hoveredNodeInfo.client && (
                      <span className="text-primary">[client]</span>
                    )}
                    {hoveredNodeInfo.server && hoveredNodeInfo.client && (
                      <span> </span>
                    )}
                    {hoveredNodeInfo.server && (
                      <span className="text-primary">[server]</span>
                    )}
                  </span>
                )}
              </>
            ) : (
              'Hover over a file to see details'
            )}
          </p>
        </div>
      )}
    </main>
  )
}

function getRootSourceIndex(analyzeData: AnalyzeData | undefined): number {
  if (!analyzeData) return 0
  const sourceRoots = analyzeData.sourceRoots()
  return sourceRoots.length > 0 ? sourceRoots[0] : 0
}

async function fetchAnalyzeData(url: string): Promise<AnalyzeData> {
  const resp = await fetchStrict(url)
  return new AnalyzeData(await resp.arrayBuffer())
}

async function fetchModulesData(url: string): Promise<ModulesData> {
  const resp = await fetchStrict(url)
  return new ModulesData(await resp.arrayBuffer())
}
