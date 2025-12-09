'use client'

import type React from 'react'
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
  isLoading = false,
}: SidebarProps) {
  if (isLoading) {
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

  if (!analyzeData) {
    return null
  }

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
      ? analyzeData.getSourceRecursiveModuleCount(selectedSourceIndex)
      : null

  return (
    <div
      className="flex-none bg-muted border-l border-border overflow-y-auto"
      style={{ width: `${sidebarWidth}%` }}
    >
      <div className="flex-1 p-3 space-y-8 overflow-y-auto">
        <div className="space-y-2">
          <h2 className="text-s font-semibold mb-1 text-foreground truncate">
            {selectedSource
              ? selectedSource.path || 'All Route Modules'
              : 'Unknown Source'}
          </h2>
          {selectedSourceIndex != null &&
          analyzeData.source(selectedSourceIndex) ? (
            <div>
              <div className="text-xs">
                <span>
                  {hasChildModules
                    ? formatBytes(
                        analyzeData.getSourceRecursiveSize(selectedSourceIndex)
                      )
                    : formatBytes(
                        analyzeData.getSourceOutputSize(selectedSourceIndex)
                      )}
                </span>{' '}
                <span className="text-muted-foreground">bundled</span>
              </div>
              {hasChildModules && childModuleCount != null ? (
                <div className="text-xs">
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
            <dl>
              <div className="flex items-center gap-2">
                <dt className="inline-flex items-center">
                  <Badge variant="polyfill">Polyfill</Badge>
                </dt>
                <dd className="text-xs text-muted-foreground">
                  Next.js built-in polyfills
                </dd>
              </div>
            </dl>
          )}

        {selectedSourceIndex != null &&
          analyzeData.source(selectedSourceIndex) &&
          !hasChildModules && (
            <>
              {modulesData && (
                <ImportChain
                  key={selectedSourceIndex}
                  startFileId={selectedSourceIndex}
                  analyzeData={analyzeData}
                  modulesData={modulesData}
                  depthMap={moduleDepthMap}
                  environmentFilter={environmentFilter}
                />
              )}
              {(() => {
                const chunks = analyzeData.sourceChunks(selectedSourceIndex)
                if (chunks.length > 0) {
                  return (
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
                  )
                }
                return null
              })()}
            </>
          )}
      </div>
    </div>
  )
}
