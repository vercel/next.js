'use client'

import { BaselinePicker } from '@/components/baseline-picker'
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

export function ControlDivider() {
  return <span className="h-6 w-px bg-muted-foreground/30" />
}

export function TopBar({
  selectedRoute,
  setSelectedRoute,
  environmentFilter,
  setEnvironmentFilter,
  setSelectedSourceIndex,
  setFocusedSourceIndex,
  typeFilter,
  setTypeFilter,
  searchQuery,
  setSearchQuery,
  baselineSnapshot,
  onBaselineChange,
  comparisonSnapshot,
  onComparisonChange,
  compareView,
  onCompareViewChange,
  routeDiff,
  routeTotals,
  hasSourceData,
  showViewToggle,
  showComparison = true,
  initialOnly,
  onInitialOnlyChange,
}: {
  hasSourceData: boolean
  showViewToggle: boolean
  selectedRoute: string | null
  setSelectedRoute: (route: string | null) => void
  environmentFilter: Environment
  setEnvironmentFilter: (env: Environment) => void
  setSelectedSourceIndex: (index: number | null) => void
  setFocusedSourceIndex: (index: number | null) => void
  typeFilter: string[]
  setTypeFilter: (types: string[]) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  baselineSnapshot: SnapshotMetadata | null
  onBaselineChange: (snapshot: SnapshotMetadata | null) => void
  comparisonSnapshot: SnapshotMetadata | null
  onComparisonChange: (snapshot: SnapshotMetadata | null) => void
  compareView: CompareView
  onCompareViewChange: (view: CompareView) => void
  routeDiff: ReturnType<typeof diffRoutesWithSizes> | null
  routeTotals?: ReadonlyMap<string, RouteSizeTotals> | null
  showComparison?: boolean
  initialOnly?: boolean
  onInitialOnlyChange?: (value: boolean) => void
}) {
  const isCompareMode = baselineSnapshot != null
  return (
    <div className="flex-none border-b border-border">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap sm:gap-3">
        <div className="flex min-w-0 flex-1 basis-full sm:basis-auto">
          <RouteTypeahead
            selectedRoute={selectedRoute}
            onRouteSelected={(route) => {
              setSelectedRoute(route)
              setSelectedSourceIndex(null)
              setFocusedSourceIndex(null)
            }}
            routeDiff={isCompareMode ? routeDiff : null}
            routeTotals={routeTotals}
            useCompressed
          />
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {showComparison ? (
            <BaselinePicker
              selectedSnapshotId={baselineSnapshot?.id ?? null}
              onSelectionChange={onBaselineChange}
              excludedSnapshotId={comparisonSnapshot?.id}
              prefix="from"
              placeholder="Compare from…"
            />
          ) : null}
          {isCompareMode ? (
            <BaselinePicker
              selectedSnapshotId={comparisonSnapshot?.id ?? null}
              onSelectionChange={onComparisonChange}
              excludedSnapshotId={baselineSnapshot?.id}
              prefix="to"
              placeholder="to Latest"
              clearLabel="Compare with latest"
            />
          ) : null}
          {hasSourceData ? (
            <FileSearch value={searchQuery} onChange={setSearchQuery} />
          ) : null}
        </div>
      </div>

      {hasSourceData && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-border bg-muted/20 px-4 py-1.5">
          <Select
            value={environmentFilter}
            onValueChange={(value: Environment) => setEnvironmentFilter(value)}
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

          {!isCompareMode && onInitialOnlyChange ? (
            <label
              className="flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap px-1"
              title="Show only modules with an initial synchronous path"
            >
              <span className="text-xs">Initial only</span>
              <Switch
                checked={initialOnly}
                onCheckedChange={onInitialOnlyChange}
                aria-label="Show only modules with an initial synchronous path"
              />
            </label>
          ) : null}

          {showViewToggle && (
            <ToggleGroup
              type="single"
              size="sm"
              value={compareView}
              onValueChange={(value) => {
                if (value) onCompareViewChange(value as CompareView)
              }}
              aria-label="View"
              className="ml-auto shrink-0 pl-4"
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
        </div>
      )}
    </div>
  )
}
