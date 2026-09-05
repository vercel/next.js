'use client'

import type React from 'react'
import { useState, useMemo } from 'react'
import { CircleHelp } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import { ImportChain } from '@/components/import-chain'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import { SpecialModule } from '@/lib/types'
import { cn, getSpecialModuleType } from '@/lib/utils'
import { Badge } from './ui/badge'
import type { DiffSummary, SourceDiffRow } from '@/lib/diff'
import { formatDelta } from '@/lib/diff'

interface SidebarProps {
  sidebarWidth: number
  analyzeData: AnalyzeData | null
  modulesData: ModulesData | null
  selectedSourceIndex: number | null
  moduleDepthMap: Map<number, number>
  environmentFilter: 'client' | 'server'
  filterSource?: (sourceIndex: number) => boolean
  isLoading?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function Sidebar({
  sidebarWidth,
  analyzeData,
  modulesData,
  selectedSourceIndex,
  moduleDepthMap,
  environmentFilter,
  filterSource,
  isLoading = false,
}: SidebarProps) {
  filterSource = filterSource ?? (() => true)

  if (isLoading || !analyzeData) {
    return (
      <div
        className="flex-none bg-muted border-l border-border overflow-y-auto"
        style={{ width: `${sidebarWidth}%` }}
      >
        <div className="flex-1 p-3 space-y-4 overflow-y-auto">
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
    )
  }

  return (
    <div
      className="flex-none bg-muted border-l border-border overflow-y-auto"
      style={{ width: `${sidebarWidth}%` }}
    >
      {selectedSourceIndex != null ? (
        <SelectionDetails
          analyzeData={analyzeData}
          modulesData={modulesData}
          selectedSourceIndex={selectedSourceIndex}
          filterSource={filterSource}
          moduleDepthMap={moduleDepthMap}
          environmentFilter={environmentFilter}
        />
      ) : null}
    </div>
  )
}

function SelectionDetails({
  analyzeData,
  modulesData,
  selectedSourceIndex,
  filterSource,
  moduleDepthMap,
  environmentFilter,
}: {
  analyzeData: AnalyzeData
  modulesData: ModulesData | null
  selectedSourceIndex: number
  moduleDepthMap: Map<number, number>
  environmentFilter: 'client' | 'server'
  filterSource: (sourceIndex: number) => boolean
}) {
  const specialModuleType = getSpecialModuleType(
    analyzeData,
    selectedSourceIndex
  )

  const selectedSource =
    selectedSourceIndex != null
      ? analyzeData.source(selectedSourceIndex)
      : undefined

  const hasChildModules =
    selectedSourceIndex != null &&
    analyzeData.sourceChildren(selectedSourceIndex).length > 0

  const childModuleCount =
    hasChildModules && selectedSourceIndex != null
      ? analyzeData.getRecursiveModuleCount(selectedSourceIndex, filterSource)
      : null

  const { size, compressedSize } = analyzeData.getRecursiveSizes(
    selectedSourceIndex,
    filterSource
  )

  const chunks =
    selectedSourceIndex != null
      ? analyzeData.sourceChunks(selectedSourceIndex)
      : []

  return (
    <div className="flex-1 p-3 space-y-8 overflow-y-auto">
      <div className="space-y-2">
        <h2 className="text-s font-semibold mb-1 text-foreground truncate">
          {selectedSource?.path || 'All Route Modules'}
        </h2>
        {selectedSourceIndex != null &&
        analyzeData.source(selectedSourceIndex) ? (
          <div className="text-xs">
            <div>
              <span>{formatBytes(compressedSize)}</span>
              <span className="text-muted-foreground ml-1">
                compressed (estimated)
              </span>
              <InlineHelpTooltip>
                Estimated compressed size. Modules are compressed in isolation
                which may differ from their size in the final chunk.
              </InlineHelpTooltip>
            </div>
            <div>
              <span>{formatBytes(size)}</span>{' '}
              <span className="text-muted-foreground">uncompressed</span>
              <InlineHelpTooltip>
                Uncompressed modules may still be minified, tree-shaken, and
                dead-code eliminated. They just don't account for general
                compression like gzip.
              </InlineHelpTooltip>
            </div>
            {hasChildModules && childModuleCount != null ? (
              <div>
                <span>{childModuleCount} </span>
                <span className="text-muted-foreground">
                  {childModuleCount === 1 ? 'module' : 'modules'}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedSourceIndex != null &&
        analyzeData.source(selectedSourceIndex) &&
        (specialModuleType === SpecialModule.POLYFILL_MODULE ||
          specialModuleType === SpecialModule.POLYFILL_NOMODULE) && (
          <dl className="flex items-center gap-2">
            <dt className="inline-flex items-center">
              <Badge variant="polyfill">Polyfill</Badge>
            </dt>
            <dd className="text-xs text-muted-foreground">
              Next.js built-in polyfills
            </dd>
          </dl>
        )}

      {selectedSourceIndex != null &&
        analyzeData.source(selectedSourceIndex) &&
        !hasChildModules && (
          <>
            {modulesData && (
              <ImportChain
                startFileId={selectedSourceIndex}
                analyzeData={analyzeData}
                modulesData={modulesData}
                depthMap={moduleDepthMap}
                environmentFilter={environmentFilter}
              />
            )}
            {chunks.length > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-semibold text-foreground">
                  Output Chunks
                </p>
                <ul className="text-xs text-muted-foreground font-mono mt-1 space-y-1">
                  {chunks.map((chunk) => (
                    <li key={chunk} className="break-all">
                      {chunk}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
    </div>
  )
}

export function CompareSidebar({
  selectedKey,
  sourceDiff,
  analyzeData,
  baselineAnalyzeData,
  modulesData,
  baselineModulesData,
  moduleDepthMap,
  baselineModuleDepthMap,
  environmentFilter,
  sidebarWidth,
  aLabel,
  bLabel,
}: {
  selectedKey: string | null
  sourceDiff: DiffSummary<SourceDiffRow> | null
  analyzeData: AnalyzeData | null
  baselineAnalyzeData: AnalyzeData | null
  modulesData: ModulesData | null
  baselineModulesData: ModulesData | null
  moduleDepthMap: Map<number, number>
  baselineModuleDepthMap: Map<number, number>
  environmentFilter: 'client' | 'server'
  sidebarWidth: number
  aLabel: string
  bLabel: string
}) {
  const selectedRow = useMemo(() => {
    if (!selectedKey || !sourceDiff) return null
    return sourceDiff.rows.find((r) => r.key === selectedKey) ?? null
  }, [selectedKey, sourceDiff])

  return (
    <div
      className="flex-none bg-muted border-l border-border overflow-y-auto"
      style={{ width: `${sidebarWidth}%` }}
    >
      {selectedRow ? (
        <CompareSidebarContent
          key={selectedRow.key}
          row={selectedRow}
          analyzeData={analyzeData}
          baselineAnalyzeData={baselineAnalyzeData}
          modulesData={modulesData}
          baselineModulesData={baselineModulesData}
          moduleDepthMap={moduleDepthMap}
          baselineModuleDepthMap={baselineModuleDepthMap}
          environmentFilter={environmentFilter}
          aLabel={aLabel}
          bLabel={bLabel}
        />
      ) : (
        <div className="p-3 text-xs text-muted-foreground">
          Click a row or treemap tile to see import details.
        </div>
      )}
    </div>
  )
}

function CompareSidebarContent({
  row,
  analyzeData,
  baselineAnalyzeData,
  modulesData,
  baselineModulesData,
  moduleDepthMap,
  baselineModuleDepthMap,
  environmentFilter,
  aLabel,
  bLabel,
}: {
  row: SourceDiffRow
  analyzeData: AnalyzeData | null
  baselineAnalyzeData: AnalyzeData | null
  modulesData: ModulesData | null
  baselineModulesData: ModulesData | null
  moduleDepthMap: Map<number, number>
  baselineModuleDepthMap: Map<number, number>
  environmentFilter: 'client' | 'server'
  aLabel: string
  bLabel: string
}) {
  const hasBoth = row.sourceIndexA != null && row.sourceIndexB != null
  const [activeTab, setActiveTab] = useState<'A' | 'B'>(
    row.status === 'removed' ? 'A' : 'B'
  )

  const activeSourceIndex =
    activeTab === 'A' ? row.sourceIndexA : row.sourceIndexB
  const activeAnalyzeData =
    activeTab === 'A' ? baselineAnalyzeData : analyzeData
  const activeModulesData =
    activeTab === 'A' ? baselineModulesData : modulesData
  const activeDepthMap =
    activeTab === 'A' ? baselineModuleDepthMap : moduleDepthMap

  const compressedDelta = row.compressedB - row.compressedA

  return (
    <div className="flex-1 p-3 space-y-4 overflow-y-auto">
      <div className="space-y-1">
        <h2 className="text-s font-semibold text-foreground break-all">
          {row.name}
        </h2>
        <div className="text-xs space-y-0.5">
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="text-muted-foreground font-mono">
              {formatBytes(row.compressedA)}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="font-mono">{formatBytes(row.compressedB)}</span>
            <span className="text-muted-foreground">compressed</span>
            {row.status !== 'identical' && (
              <span
                className={cn(
                  'font-mono',
                  compressedDelta > 0 && 'text-red-600 dark:text-red-400',
                  compressedDelta < 0 && 'text-green-600 dark:text-green-400',
                  compressedDelta === 0 && 'text-muted-foreground'
                )}
              >
                {formatDelta(compressedDelta)}
              </span>
            )}
          </div>
        </div>
      </div>

      {hasBoth && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('A')}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              activeTab === 'A'
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {aLabel}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('B')}
            className={cn(
              'px-2 py-0.5 text-xs rounded transition-colors',
              activeTab === 'B'
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {bLabel}
          </button>
        </div>
      )}

      {activeSourceIndex != null && activeAnalyzeData && activeModulesData ? (
        <ImportChain
          startFileId={activeSourceIndex}
          analyzeData={activeAnalyzeData}
          modulesData={activeModulesData}
          depthMap={activeDepthMap}
          environmentFilter={environmentFilter}
        />
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Import chain not available.
        </p>
      )}
    </div>
  )
}

function InlineHelpTooltip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <CircleHelp
            size={14}
            className="inline-block ml-1 text-muted-foreground"
            aria-hidden="true"
          />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" side="top" align="center">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
