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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { diffRoutesWithSizes } from '@/lib/diff'
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
  compareView,
  onCompareViewChange,
  routeDiff,
  hasSourceData,
  showViewToggle,
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
  compareView: CompareView
  onCompareViewChange: (view: CompareView) => void
  routeDiff: ReturnType<typeof diffRoutesWithSizes> | null
}) {
  const isCompareMode = baselineSnapshot != null
  return (
    <div className="flex-none px-4 py-2 border-b border-border flex items-center gap-3">
      <div className="flex-1 flex">
        <RouteTypeahead
          selectedRoute={selectedRoute}
          onRouteSelected={(route) => {
            setSelectedRoute(route)
            setSelectedSourceIndex(null)
            setFocusedSourceIndex(null)
          }}
          routeDiff={isCompareMode ? routeDiff : null}
          useCompressed
        />
      </div>

      <div className="flex items-center gap-2">
        <BaselinePicker
          selectedSnapshotId={baselineSnapshot?.id ?? null}
          onSelectionChange={onBaselineChange}
        />

        {showViewToggle && (
          <ToggleGroup
            type="single"
            size="sm"
            value={compareView}
            onValueChange={(value) => {
              if (value) onCompareViewChange(value as CompareView)
            }}
            aria-label="View"
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

        {hasSourceData && (
          <>
            <ControlDivider />

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

            {!isCompareMode && (
              <>
                <ControlDivider />
                <FileSearch value={searchQuery} onChange={setSearchQuery} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
