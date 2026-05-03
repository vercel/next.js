'use client'

import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'

import { ErrorState } from '@/components/error-state'
import { FileSearch } from '@/components/file-search'
import { RouteTypeahead } from '@/components/route-typeahead'
import { Sidebar } from '@/components/sidebar'
import { TreemapVisualizer } from '@/components/treemap-visualizer'
import { Badge } from '@/components/ui/badge'
import { TreemapSkeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import { computeActiveEntries, computeModuleDepthMap } from '@/lib/module-graph'
import { fetchStrict, formatBytes } from '@/lib/utils'
import { SizeMode } from '@/lib/treemap-layout'
import { Monitor, Server, FileCode, FileJson, Palette, Package } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

enum Environment {
  Client = 'client',
  Server = 'server',
}

/** Options shown in the file-type multi-select filter. */
const TYPE_FILTER_OPTIONS = [
  { value: 'js',    label: 'JavaScript', icon: <FileCode className="h-3.5 w-3.5" /> },
  { value: 'css',   label: 'CSS',        icon: <Palette  className="h-3.5 w-3.5" /> },
  { value: 'json',  label: 'JSON',       icon: <FileJson className="h-3.5 w-3.5" /> },
  { value: 'asset', label: 'Asset',      icon: <Package  className="h-3.5 w-3.5" /> },
]

// ---------------------------------------------------------------------------
// Data fetchers (kept outside the component to avoid re-creation on render)
// ---------------------------------------------------------------------------

async function fetchAnalyzeData(url: string): Promise<AnalyzeData> {
  const resp = await fetchStrict(url)
  return new AnalyzeData(await resp.arrayBuffer())
}

async function fetchModulesData(url: string): Promise<ModulesData> {
  const resp = await fetchStrict(url)
  return new ModulesData(await resp.arrayBuffer())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the first root source index from analyzeData, or 0 as fallback. */
function getRootSourceIndex(analyzeData: AnalyzeData | undefined): number {
  if (!analyzeData) return 0
  const roots = analyzeData.sourceRoots()
  return roots.length > 0 ? roots[0] : 0
}

/**
 * Builds the SWR key for analyze data based on the selected route.
 * - No route   → null (SWR skips the fetch)
 * - "/"        → "data/analyze.data"
 * - "/foo/bar" → "data/foo/bar/analyze.data"
 */
function getAnalyzeDataPath(route: string | null): string | null {
  if (!route) return null
  if (route === '/') return 'data/analyze.data'
  return `data/${route.replace(/^\//, '')}/analyze.data`
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  // --- Routing & filters ---
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [environmentFilter, setEnvironmentFilter] = useState<Environment>(Environment.Client)
  const [typeFilter, setTypeFilter] = useState(['js', 'css', 'json'])
  const [searchQuery, setSearchQuery] = useState('')

  // --- Treemap selection state ---
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null)
  const [focusedSourceIndex, setFocusedSourceIndex]   = useState<number | null>(null)

  // --- Sidebar resize state ---
  const [sidebarWidth, setSidebarWidth] = useState(20) // percentage of viewport
  const [isResizing, setIsResizing]     = useState(false)

  // --- Hover tooltip state ---
  const [isMouseInTreemap, setIsMouseInTreemap] = useState(false)
  const [hoveredNodeInfo, setHoveredNodeInfo]   = useState<{
    name: string
    size: number
    server?: boolean
    client?: boolean
  } | null>(null)

  // --- Data fetching ---
  const {
    data: modulesData,
    isLoading: isModulesLoading,
    error: modulesError,
  } = useSWR<ModulesData>('data/modules.data', fetchModulesData)

  const {
    data: analyzeData,
    isLoading: isAnalyzeLoading,
    error: analyzeError,
  } = useSWR<AnalyzeData>(getAnalyzeDataPath(selectedRoute), fetchAnalyzeData, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // When new data arrives, reset selection to the root node
    onSuccess: (newData) => {
      const root = getRootSourceIndex(newData)
      setSelectedSourceIndex(root)
      setFocusedSourceIndex(root)
    },
  })

  // --- Keyboard shortcut: Escape resets treemap selection to root ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const isInputFocused = ['INPUT', 'TEXTAREA'].includes(
        (document.activeElement as HTMLElement)?.tagName ?? ''
      )
      if (isInputFocused) return

      e.preventDefault()
      const root = getRootSourceIndex(analyzeData)
      setSelectedSourceIndex(root)
      setFocusedSourceIndex(root)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [analyzeData])

  // --- Derived values ---

  /**
   * Map of module index → depth, computed from the active entry points.
   * Used by the Sidebar to show import depth information.
   */
  const moduleDepthMap = useMemo(() => {
    if (!modulesData || !analyzeData) return new Map()
    const activeEntries = computeActiveEntries(modulesData, analyzeData)
    return computeModuleDepthMap(modulesData, activeEntries)
  }, [modulesData, analyzeData])

  /**
   * Predicate passed to the treemap to hide nodes that don't match the
   * current environment (client/server) and file-type filters.
   */
  const filterSource = useMemo(() => {
    if (!analyzeData) return () => true

    return (sourceIndex: number) => {
      const flags = analyzeData.getSourceFlags(sourceIndex)

      const matchesEnvironment =
        (environmentFilter === Environment.Client && flags.client) ||
        (environmentFilter === Environment.Server && flags.server)

      const matchesType =
        (typeFilter.includes('js')    && flags.js)    ||
        (typeFilter.includes('css')   && flags.css)   ||
        (typeFilter.includes('json')  && flags.json)  ||
        (typeFilter.includes('asset') && flags.asset)

      return matchesEnvironment && matchesType
    }
  }, [analyzeData, environmentFilter, typeFilter])

  // --- Sidebar resize handlers ---

  const handleMouseDown = () => setIsResizing(true)
  const handleMouseUp   = () => setIsResizing(false)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isResizing) return
    const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100
    setSidebarWidth(Math.max(10, Math.min(50, newWidth))) // clamp to [10%, 50%]
  }

  // --- Render helpers ---

  const error         = analyzeError || modulesError
  const isAnyLoading  = isAnalyzeLoading || isModulesLoading
  const rootSourceIndex = getRootSourceIndex(analyzeData)

  return (
    <main
      className="h-screen flex flex-col bg-background"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Top bar: route selector + filters                                   */}
      {/* ------------------------------------------------------------------ */}
      <TopBar
        analyzeData={analyzeData}
        selectedRoute={selectedRoute}
        environmentFilter={environmentFilter}
        typeFilter={typeFilter}
        searchQuery={searchQuery}
        onRouteSelected={(route) => {
          setSelectedRoute(route)
          setSelectedSourceIndex(null)
          setFocusedSourceIndex(null)
        }}
        onEnvironmentChange={setEnvironmentFilter}
        onTypeFilterChange={setTypeFilter}
        onSearchChange={setSearchQuery}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Main content area: treemap + sidebar                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex min-h-0">
        {error && !analyzeData ? (
          <ErrorState error={error} />
        ) : isAnyLoading ? (
          <LoadingLayout sidebarWidth={sidebarWidth} environmentFilter={environmentFilter} />
        ) : analyzeData ? (
          <ContentLayout
            analyzeData={analyzeData}
            modulesData={modulesData ?? null}
            rootSourceIndex={rootSourceIndex}
            selectedSourceIndex={selectedSourceIndex}
            focusedSourceIndex={focusedSourceIndex}
            sidebarWidth={sidebarWidth}
            isMouseInTreemap={isMouseInTreemap}
            filterSource={filterSource}
            moduleDepthMap={moduleDepthMap}
            environmentFilter={environmentFilter}
            searchQuery={searchQuery}
            onSelectSourceIndex={setSelectedSourceIndex}
            onFocusSourceIndex={setFocusedSourceIndex}
            onMouseInTreemapChange={setIsMouseInTreemap}
            onHoveredNodeChange={setHoveredNodeInfo}
            onResizeStart={handleMouseDown}
          />
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Status bar: shows hovered node info                                 */}
      {/* ------------------------------------------------------------------ */}
      {analyzeData && (
        <HoverStatusBar hoveredNodeInfo={hoveredNodeInfo} />
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Shown while modules or analyze data is loading.
 * Renders a skeleton treemap and a disabled sidebar.
 */
function LoadingLayout({
  sidebarWidth,
  environmentFilter,
}: {
  sidebarWidth: number
  environmentFilter: Environment
}) {
  return (
    <>
      <div className="flex-1 min-w-0 p-4 bg-background">
        <TreemapSkeleton />
      </div>

      <ResizeDivider disabled />

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
  )
}

/**
 * Shown when data is fully loaded.
 * Renders the interactive treemap, a draggable resize handle, and the sidebar.
 */
function ContentLayout({
  analyzeData,
  modulesData,
  rootSourceIndex,
  selectedSourceIndex,
  focusedSourceIndex,
  sidebarWidth,
  isMouseInTreemap,
  filterSource,
  moduleDepthMap,
  environmentFilter,
  searchQuery,
  onSelectSourceIndex,
  onFocusSourceIndex,
  onMouseInTreemapChange,
  onHoveredNodeChange,
  onResizeStart,
}: {
  analyzeData: AnalyzeData
  modulesData: ModulesData | null
  rootSourceIndex: number
  selectedSourceIndex: number | null
  focusedSourceIndex: number | null
  sidebarWidth: number
  isMouseInTreemap: boolean
  filterSource: (index: number) => boolean
  moduleDepthMap: Map<number, number>
  environmentFilter: Environment
  searchQuery: string
  onSelectSourceIndex: (index: number | null) => void
  onFocusSourceIndex: (index: number | null) => void
  onMouseInTreemapChange: (value: boolean) => void
  onHoveredNodeChange: (info: { name: string; size: number; server?: boolean; client?: boolean } | null) => void
  onResizeStart: () => void
}) {
  return (
    <>
      <div className="flex-1 min-w-0">
        <TreemapVisualizer
          analyzeData={analyzeData}
          sourceIndex={rootSourceIndex}
          selectedSourceIndex={selectedSourceIndex ?? rootSourceIndex}
          onSelectSourceIndex={onSelectSourceIndex}
          focusedSourceIndex={focusedSourceIndex ?? rootSourceIndex}
          onFocusSourceIndex={onFocusSourceIndex}
          isMouseInTreemap={isMouseInTreemap}
          onMouseInTreemapChange={onMouseInTreemapChange}
          onHoveredNodeChange={onHoveredNodeChange}
          searchQuery={searchQuery}
          filterSource={filterSource}
          sizeMode={SizeMode.Compressed}
        />
      </div>

      <ResizeDivider onMouseDown={onResizeStart} />

      <Sidebar
        sidebarWidth={sidebarWidth}
        analyzeData={analyzeData}
        modulesData={modulesData}
        selectedSourceIndex={selectedSourceIndex}
        moduleDepthMap={moduleDepthMap}
        environmentFilter={environmentFilter}
        filterSource={filterSource}
      />
    </>
  )
}

/**
 * Thin vertical divider that acts as a drag handle for resizing the sidebar.
 * When `disabled`, the drag cursor and hover styles are suppressed.
 */
function ResizeDivider({
  onMouseDown,
  disabled = false,
}: {
  onMouseDown?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`flex-none w-1 bg-border transition-colors ${
        disabled ? 'cursor-col-resize' : 'hover:bg-primary cursor-col-resize'
      }`}
      onMouseDown={!disabled ? onMouseDown : undefined}
      disabled={disabled}
      aria-label="Resize sidebar"
    />
  )
}

/**
 * Top bar containing the route selector, environment toggle,
 * file-type multi-select, and the search input.
 */
function TopBar({
  analyzeData,
  selectedRoute,
  environmentFilter,
  typeFilter,
  searchQuery,
  onRouteSelected,
  onEnvironmentChange,
  onTypeFilterChange,
  onSearchChange,
}: {
  analyzeData: AnalyzeData | undefined
  selectedRoute: string | null
  environmentFilter: Environment
  typeFilter: string[]
  searchQuery: string
  onRouteSelected: (route: string | null) => void
  onEnvironmentChange: (env: Environment) => void
  onTypeFilterChange: (types: string[]) => void
  onSearchChange: (query: string) => void
}) {
  return (
    <div className="flex-none px-4 py-2 border-b border-border flex items-center gap-3">
      {/* Route selector takes all available space on the left */}
      <div className="flex-1 flex">
        <RouteTypeahead selectedRoute={selectedRoute} onRouteSelected={onRouteSelected} />
      </div>

      {/* Controls on the right — only shown after data is loaded */}
      {analyzeData && (
        <div className="flex items-center gap-2">
          {/* Environment toggle: Client / Server */}
          <Select
            value={environmentFilter}
            onValueChange={(value: Environment) => onEnvironmentChange(value)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={Environment.Client}>
                <div className="flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5" />
                  <span className="text-xs">Client</span>
                </div>
              </SelectItem>
              <SelectItem value={Environment.Server}>
                <div className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5" />
                  <span className="text-xs">Server</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* File type multi-select filter */}
          <MultiSelect
            options={TYPE_FILTER_OPTIONS}
            value={typeFilter}
            onValueChange={onTypeFilterChange}
            selectionName={{ singular: 'file type', plural: 'file types' }}
            triggerIcon={<FileCode className="h-3.5 w-3.5" />}
            triggerClassName="w-36"
            aria-label="Filter by file type"
          />

          <ControlDivider />

          {/* File search input */}
          <FileSearch value={searchQuery} onChange={onSearchChange} />
        </div>
      )}
    </div>
  )
}

/**
 * Bottom status bar that shows the name, compressed size,
 * and environment badges for whichever node is currently hovered.
 */
function HoverStatusBar({
  hoveredNodeInfo,
}: {
  hoveredNodeInfo: {
    name: string
    size: number
    server?: boolean
    client?: boolean
  } | null
}) {
  return (
    <div className="flex-none border-t border-border bg-background px-4 py-2 h-10">
      <div className="text-sm text-muted-foreground">
        {hoveredNodeInfo ? (
          <>
            <span className="font-medium text-foreground">{hoveredNodeInfo.name}</span>
            <span className="ml-2">{`${formatBytes(hoveredNodeInfo.size)} compressed`}</span>
            {(hoveredNodeInfo.server || hoveredNodeInfo.client) && (
              <span className="ml-2 inline-flex gap-1">
                {hoveredNodeInfo.client && <Badge variant="client">client</Badge>}
                {hoveredNodeInfo.server && <Badge variant="server">server</Badge>}
              </span>
            )}
          </>
        ) : (
          'Hover over a file to see details'
        )}
      </div>
    </div>
  )
}

/** Thin vertical separator between toolbar controls. */
function ControlDivider() {
  return <span className="h-6 w-px bg-muted-foreground/30" />
}