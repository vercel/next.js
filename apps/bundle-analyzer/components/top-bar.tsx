'use client'

import { BuildPicker } from '@/components/build-picker'
import { FileSearch } from '@/components/file-search'
import { RouteTypeahead } from '@/components/route-typeahead'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { diffRoutesWithSizes, type RouteSizeTotals } from '@/lib/diff'
import { type SnapshotMetadata } from '@/lib/snapshot'
import {
  Monitor,
  Server,
  FileCode,
  FileJson,
  Palette,
  Package,
  Table as TableIcon,
  LayoutGrid,
} from 'lucide-react'

export enum Environment {
  Client = 'client',
  Server = 'server',
}

export enum CompareView {
  Treemap = 'treemap',
  Table = 'table',
}

const typeFilterOptions = [
  {
    value: 'js',
    label: 'JavaScript',
    icon: <FileCode className="h-3.5 w-3.5" />,
  },
  { value: 'css', label: 'CSS', icon: <Palette className="h-3.5 w-3.5" /> },
  {
    value: 'json',
    label: 'JSON',
    icon: <FileJson className="h-3.5 w-3.5" />,
  },
  {
    value: 'asset',
    label: 'Asset',
    icon: <Package className="h-3.5 w-3.5" />,
  },
]

export function TopBar({
  selectedRoute,
  routePickerOpen,
  onRoutePickerOpenChange,
  setSelectedRoute,
  getRouteHref,
  environmentFilter,
  setEnvironmentFilter,
  setSelectedSourceIndex,
  setFocusedSourceIndex,
  typeFilter,
  setTypeFilter,
  searchQuery,
  setSearchQuery,
  isCompareMode,
  historySnapshots,
  historyLoading,
  historyError,
  latestSnapshot,
  singleBuildName,
  fromName,
  toName,
  onSingleBuildChange,
  onComparisonChange,
  routesBaseDir,
  compareView,
  onCompareViewChange,
  routeDiff,
  routeTotals,
  hasSourceData,
  showViewToggle,
  initialLoaded,
  onInitialLoadedChange,
}: {
  hasSourceData: boolean
  showViewToggle: boolean
  selectedRoute: string | null
  routePickerOpen: boolean
  onRoutePickerOpenChange: (open: boolean) => void
  setSelectedRoute: (route: string | null) => void
  getRouteHref?: (route: string) => string
  environmentFilter: Environment
  setEnvironmentFilter: (env: Environment) => void
  setSelectedSourceIndex: (index: number | null) => void
  setFocusedSourceIndex: (index: number | null) => void
  typeFilter: string[]
  setTypeFilter: (types: string[]) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  isCompareMode: boolean
  historySnapshots: SnapshotMetadata[]
  historyLoading: boolean
  historyError: boolean
  latestSnapshot: SnapshotMetadata
  singleBuildName: string | null
  fromName: string | null | undefined
  toName: string | null | undefined
  onSingleBuildChange: (name: string | null) => void
  onComparisonChange: (from: string | null, to: string | null) => void
  routesBaseDir: string
  compareView: CompareView
  onCompareViewChange: (view: CompareView) => void
  routeDiff: ReturnType<typeof diffRoutesWithSizes> | null
  routeTotals?: ReadonlyMap<string, RouteSizeTotals> | null
  initialLoaded?: boolean
  onInitialLoadedChange?: (value: boolean) => void
}) {
  const routeSelection = getRouteHref
    ? ({ mode: 'link', getRouteHref } as const)
    : ({
        mode: 'action',
        onRouteSelected: (route: string) => {
          setSelectedRoute(route)
          setSelectedSourceIndex(null)
          setFocusedSourceIndex(null)
        },
      } as const)
  return (
    <div className="flex-none border-b border-border">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto px-4 py-2">
        <div className="flex min-w-48 flex-1 gap-2">
          <BuildPicker
            compareMode={isCompareMode}
            historySnapshots={historySnapshots}
            historyLoading={historyLoading}
            historyError={historyError}
            latestSnapshot={latestSnapshot}
            singleBuildName={singleBuildName}
            fromName={fromName}
            toName={toName}
            onSingleBuildChange={onSingleBuildChange}
            onComparisonChange={onComparisonChange}
          />

          <RouteTypeahead
            selectedRoute={selectedRoute}
            open={routePickerOpen}
            onOpenChange={onRoutePickerOpenChange}
            {...routeSelection}
            routeDiff={isCompareMode ? routeDiff : null}
            routeTotals={routeTotals}
            routesBaseDir={routesBaseDir}
            useCompressed
          />
        </div>

        {hasSourceData && (
          <div className="flex shrink-0 items-center gap-2">
            {showViewToggle && (
              <ToggleGroup
                type="single"
                size="sm"
                value={compareView}
                onValueChange={(value) => {
                  if (value) onCompareViewChange(value as CompareView)
                }}
                aria-label="View"
                className="shrink-0"
              >
                <ToggleGroupItem
                  value={CompareView.Table}
                  aria-label="Table view"
                  title="Table view"
                  className="gap-1.5"
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  <span className="text-xs">Table</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value={CompareView.Treemap}
                  aria-label="Treemap view"
                  title="Treemap view"
                  className="gap-1.5"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="text-xs">Treemap</span>
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            <Select
              value={environmentFilter}
              onValueChange={(value: Environment) =>
                setEnvironmentFilter(value)
              }
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

            <MultiSelect
              options={typeFilterOptions}
              value={typeFilter}
              onValueChange={setTypeFilter}
              selectionName={{ singular: 'file type', plural: 'file types' }}
              triggerIcon={<FileCode className="h-3.5 w-3.5" />}
              triggerClassName="w-36"
              aria-label="Filter by file type"
            />

            {!isCompareMode && onInitialLoadedChange ? (
              <label
                className="flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap px-1"
                title="Show only modules with an initial synchronous path"
              >
                <span className="text-xs">Initial load only</span>
                <Switch
                  checked={initialLoaded}
                  onCheckedChange={onInitialLoadedChange}
                  aria-label="Show only modules with an initial synchronous path"
                />
              </label>
            ) : null}

            {hasSourceData ? (
              <FileSearch value={searchQuery} onChange={setSearchQuery} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
