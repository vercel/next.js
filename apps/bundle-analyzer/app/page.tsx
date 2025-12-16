'use client'

import type React from 'react'
import { SizeMode } from '@/lib/treemap-layout'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ErrorState } from '@/components/error-state'
import { FileSearch } from '@/components/file-search'
import { RouteTypeahead } from '@/components/route-typeahead'
import { Sidebar } from '@/components/sidebar'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

import { Badge } from '@/components/ui/badge'
import { TreemapSkeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import { computeActiveEntries, computeModuleDepthMap } from '@/lib/module-graph'
import { fetchStrict } from '@/lib/utils'
import { formatBytes } from '@/lib/utils'

enum Environment {
  Client = 'client',
  Server = 'server',
}

export default function Home() {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [environmentFilter, setEnvironmentFilter] = useState<Environment>(
    Environment.Client
  )
  const [typeFilter, setTypeFilter] = useState(['js', 'css', 'json'])
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
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
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
    size: number
    server?: boolean
    client?: boolean
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sizeMode, setSizeMode] = useState(SizeMode.Compressed)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // esc clears current treemap source selection
      if (e.key === 'Escape') {
        const activeElement = document.activeElement
        const isInputFocused =
          activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)

        if (!isInputFocused) {
          e.preventDefault()
          const rootSourceIndex = getRootSourceIndex(analyzeData)
          setSelectedSourceIndex(rootSourceIndex)
          setFocusedSourceIndex(rootSourceIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [analyzeData])

  // Compute module depth map from active entries
  const moduleDepthMap = useMemo(() => {
    if (!modulesData || !analyzeData) return new Map()

    const activeEntries = computeActiveEntries(modulesData, analyzeData)
    return computeModuleDepthMap(modulesData, activeEntries)
  }, [modulesData, analyzeData])

  const filterSource = useMemo(() => {
    if (!analyzeData) return () => true

    return (sourceIndex: number) => {
      const flags = analyzeData.getSourceFlags(sourceIndex)

      // Check environment filter
      const hasEnvironment =
        (environmentFilter === Environment.Client && flags.client) ||
        (environmentFilter === Environment.Server && flags.server)

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

  return (
    <main
      className="h-screen flex flex-col bg-background"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="flex-none px-4 py-2 border-b border-border flex items-center gap-4">
        <div className="basis-1/3 flex">
          <RouteTypeahead
            selectedRoute={selectedRoute}
            onRouteSelected={(route) => {
              setSelectedRoute(route)
              setSelectedSourceIndex(null)
              setFocusedSourceIndex(null)
            }}
          />
        </div>

        <div className="basis-2/3 flex justify-end items-center space-x-4">
          {analyzeData && (
            <>
              <ToggleGroup
                type="single"
                value={sizeMode}
                onValueChange={(value) => {
                  if (value) setSizeMode(value as SizeMode)
                }}
                size="sm"
              >
                <ToggleGroupItem value={SizeMode.Uncompressed}>
                  Uncompressed
                </ToggleGroupItem>
                <ToggleGroupItem value={SizeMode.Compressed}>
                  Compressed
                </ToggleGroupItem>
              </ToggleGroup>

              <ControlDivider />

              <ToggleGroup
                type="single"
                value={environmentFilter}
                onValueChange={(value) => {
                  if (value) setEnvironmentFilter(value as Environment)
                }}
                size="sm"
              >
                <ToggleGroupItem value={Environment.Client}>
                  Client
                </ToggleGroupItem>
                <ToggleGroupItem value={Environment.Server}>
                  Server
                </ToggleGroupItem>
              </ToggleGroup>

              <ControlDivider />

              <ToggleGroup
                type="multiple"
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

              <ControlDivider />

              <FileSearch value={searchQuery} onChange={setSearchQuery} />
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

            <Sidebar
              sidebarWidth={sidebarWidth}
              analyzeData={null}
              modulesData={null}
              selectedSourceIndex={null}
              moduleDepthMap={new Map()}
              environmentFilter={environmentFilter}
              isLoading={true}
            />
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
                sizeMode={sizeMode}
              />
            </div>

            <button
              type="button"
              className="flex-none w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
              onMouseDown={handleMouseDown}
              aria-label="Resize sidebar"
            />

            <Sidebar
              sidebarWidth={sidebarWidth}
              analyzeData={analyzeData ?? null}
              modulesData={modulesData ?? null}
              selectedSourceIndex={selectedSourceIndex}
              moduleDepthMap={moduleDepthMap}
              environmentFilter={environmentFilter}
              filterSource={filterSource}
            />
          </>
        ) : null}
      </div>

      {analyzeData && (
        <div className="flex-none border-t border-border bg-background px-4 py-2 h-10">
          <div className="text-sm text-muted-foreground">
            {hoveredNodeInfo ? (
              <>
                <span className="font-medium text-foreground">
                  {hoveredNodeInfo.name}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {`${formatBytes(hoveredNodeInfo.size)} ${sizeMode}`}
                </span>
                {(hoveredNodeInfo.server || hoveredNodeInfo.client) && (
                  <span className="ml-2 inline-flex gap-1">
                    {hoveredNodeInfo.client && (
                      <Badge variant="client">client</Badge>
                    )}
                    {hoveredNodeInfo.server && (
                      <Badge variant="server">server</Badge>
                    )}
                  </span>
                )}
              </>
            ) : (
              'Hover over a file to see details'
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function ControlDivider() {
  return <span className="h-6 w-px bg-muted-foreground/30" />
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
