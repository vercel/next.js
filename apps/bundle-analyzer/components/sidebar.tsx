'use client'

import type React from 'react'
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
import { getSpecialModuleType } from '@/lib/utils'
import { Badge } from './ui/badge'

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
              <span>{formatBytes(size)}</span>{' '}
              <span className="text-muted-foreground">uncompressed</span>
              <InlineHelpTooltip>
                Uncompressed modules may still be minified, tree-shaken, and
                dead-code eliminated. They just don't account for general
                compression like gzip.
              </InlineHelpTooltip>
            </div>
            <>
              <div>
                <span className="text-muted-foreground">About </span>
                <span>{formatBytes(compressedSize)}</span>
                <span className="text-muted-foreground ml-1">compressed</span>
                <InlineHelpTooltip>
                  Estimated compressed size. Modules are compressed in isolation
                  which may differ from their size in the final chunk.
                </InlineHelpTooltip>
              </div>
            </>
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
