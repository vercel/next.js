import './segment-explorer.css'
import {
  useSegmentTree,
  type SegmentTrieNode,
} from '../../segment-explorer-trie'
import { cx } from '../../utils/cx'
import { SegmentBoundaryTrigger } from './segment-boundary-trigger'
import { Tooltip } from '../tooltip/tooltip'
import { useCallback, useMemo } from 'react'
import {
  BUILTIN_PREFIX,
  getBoundaryOriginFileType,
  isBoundaryFile,
  isBuiltinBoundaryFile,
  normalizeBoundaryFilename,
} from '../../../../server/app-render/segment-explorer-path'
import { SegmentSuggestion } from './segment-suggestion'
import type { SegmentBoundaryType } from '../../../userspace/app/segment-explorer-node'

const isFileNode = (node: SegmentTrieNode) => {
  return !!node.value?.type && !!node.value?.pagePath
}

// Utility functions for global boundary management
function traverseTreeAndResetBoundaries(node: SegmentTrieNode) {
  // Reset this node's boundary if it has setBoundaryType function
  if (node.value?.setBoundaryType) {
    node.value.setBoundaryType(null)
  }

  // Recursively traverse children
  Object.values(node.children).forEach((child) => {
    if (child) {
      traverseTreeAndResetBoundaries(child)
    }
  })
}

function countActiveBoundaries(node: SegmentTrieNode): number {
  let count = 0

  // Count this node's boundary override if it's active
  // Only count when there's a non ":boundary" type and it has an active override (boundaryType is not null)
  // This means the file is showing an overridden boundary instead of its original file
  if (
    node.value?.setBoundaryType &&
    node.value.boundaryType !== null &&
    !isBoundaryFile(node.value.type)
  ) {
    count++
  }

  // Recursively count children
  Object.values(node.children).forEach((child) => {
    if (child) {
      count += countActiveBoundaries(child)
    }
  })

  return count
}

function PageRouteBar({ page }: { page: string }) {
  return (
    <div className="segment-explorer-page-route-bar">
      <BackArrowIcon />
      <span className="segment-explorer-page-route-bar-path">{page}</span>
    </div>
  )
}

function SegmentExplorerFooter({
  activeBoundariesCount,
  onGlobalReset,
}: {
  activeBoundariesCount: number
  onGlobalReset: () => void
}) {
  const hasActiveOverrides = activeBoundariesCount > 0

  return (
    <div className="segment-explorer-footer">
      <button
        className={`segment-explorer-footer-button ${!hasActiveOverrides ? 'segment-explorer-footer-button--disabled' : ''}`}
        onClick={hasActiveOverrides ? onGlobalReset : undefined}
        disabled={!hasActiveOverrides}
        type="button"
      >
        <span className="segment-explorer-footer-text">
          Clear Segment Overrides
        </span>
        {hasActiveOverrides && (
          <span className="segment-explorer-footer-badge">
            {activeBoundariesCount}
          </span>
        )}
      </button>
    </div>
  )
}

function FilePill({
  type,
  isBuiltin,
  isOverridden,
  filePath,
  fileName,
}: {
  type: string
  isBuiltin: boolean
  isOverridden: boolean
  filePath: string
  fileName: string
}) {
  return (
    <span
      className={cx(
        'segment-explorer-file-label',
        `segment-explorer-file-label--${type}`,
        isBuiltin && 'segment-explorer-file-label--builtin',
        isOverridden && 'segment-explorer-file-label--overridden'
      )}
      onClick={() => {
        openInEditor({ filePath })
      }}
    >
      <span className="segment-explorer-file-label-text">{fileName}</span>
      {isBuiltin ? <InfoIcon /> : <CodeIcon className="code-icon" />}
    </span>
  )
}

export function PageSegmentTree({ page }: { page: string }) {
  const tree = useSegmentTree()

  // Count active boundaries for the badge
  const activeBoundariesCount = useMemo(() => {
    return countActiveBoundaries(tree)
  }, [tree])

  // Global reset handler
  const handleGlobalReset = useCallback(() => {
    traverseTreeAndResetBoundaries(tree)
  }, [tree])

  return (
    <div
      data-nextjs-devtools-panel-segments-explorer
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <PageRouteBar page={page} />
      <div
        className="segment-explorer-content"
        data-nextjs-devtool-segment-explorer
        style={{
          flex: '1 1 auto',
          overflow: 'auto',
        }}
      >
        <PageSegmentTreeLayerPresentation node={tree} level={0} segment="" />
      </div>
      <SegmentExplorerFooter
        activeBoundariesCount={activeBoundariesCount}
        onGlobalReset={handleGlobalReset}
      />
    </div>
  )
}

const GLOBAL_ERROR_BOUNDARY_TYPE = 'global-error'

function PageSegmentTreeLayerPresentation({
  segment,
  node,
  level,
}: {
  segment: string
  node: SegmentTrieNode
  level: number
}) {
  const childrenKeys = useMemo(
    () => Object.keys(node.children),
    [node.children]
  )

  const missingGlobalError = useMemo(() => {
    const existingBoundaries: string[] = []
    childrenKeys.forEach((key) => {
      const childNode = node.children[key]
      if (!childNode || !childNode.value) return
      const boundaryType = getBoundaryOriginFileType(childNode.value.type)
      const isGlobalConvention = boundaryType === GLOBAL_ERROR_BOUNDARY_TYPE
      if (
        // If global-* convention is not built-in, it's existed
        (isGlobalConvention &&
          !isBuiltinBoundaryFile(childNode.value.pagePath)) ||
        (!isGlobalConvention &&
          // If it's non global boundary, we check if file is boundary type
          isBoundaryFile(childNode.value.type))
      ) {
        existingBoundaries.push(boundaryType)
      }
    })

    return (
      level === 0 && !existingBoundaries.includes(GLOBAL_ERROR_BOUNDARY_TYPE)
    )
  }, [node.children, childrenKeys, level])

  const sortedChildrenKeys = childrenKeys.sort((a, b) => {
    // Prioritize files with extensions over directories
    const aHasExt = a.includes('.')
    const bHasExt = b.includes('.')
    if (aHasExt && !bHasExt) return -1
    if (!aHasExt && bHasExt) return 1

    // For files, sort by priority: layout > template > page > boundaries > others
    if (aHasExt && bHasExt) {
      const aType = node.children[a]?.value?.type
      const bType = node.children[b]?.value?.type

      // Define priority order
      const getTypePriority = (type: string | undefined): number => {
        if (!type) return 5
        if (type === 'layout') return 1
        if (type === 'template') return 2
        if (type === 'page') return 3
        if (isBoundaryFile(type)) return 4
        return 5
      }

      const aPriority = getTypePriority(aType)
      const bPriority = getTypePriority(bType)

      // Sort by priority first
      if (aPriority !== bPriority) {
        return aPriority - bPriority
      }

      // If same priority, sort by file path
      const aFilePath = node.children[a]?.value?.pagePath || ''
      const bFilePath = node.children[b]?.value?.pagePath || ''
      return aFilePath.localeCompare(bFilePath)
    }

    // For directories, sort alphabetically
    return a.localeCompare(b)
  })

  // If it's the 1st level and contains a file, use 'app' as the folder name
  const folderName = level === 0 && !segment ? 'app' : segment

  const folderChildrenKeys: string[] = []
  const filesChildrenKeys: string[] = []

  for (const childKey of sortedChildrenKeys) {
    const childNode = node.children[childKey]
    if (!childNode) continue

    // If it's a file node, add it to filesChildrenKeys
    if (isFileNode(childNode)) {
      filesChildrenKeys.push(childKey)
      continue
    }

    // Otherwise, it's a folder node, add it to folderChildrenKeys
    folderChildrenKeys.push(childKey)
  }

  const possibleExtension =
    normalizeBoundaryFilename(filesChildrenKeys[0] || '')
      .split('.')
      .pop() || 'js'

  let firstChild = null

  for (let i = sortedChildrenKeys.length - 1; i >= 0; i--) {
    const childNode = node.children[sortedChildrenKeys[i]]
    if (!childNode || !childNode.value) continue

    const isBoundary = isBoundaryFile(childNode.value.type)

    if (!firstChild && !isBoundary) {
      firstChild = childNode
      break
    }
  }
  let firstBoundaryChild = null
  for (const childKey of sortedChildrenKeys) {
    const childNode = node.children[childKey]
    if (!childNode || !childNode.value) continue
    if (isBoundaryFile(childNode.value.type)) {
      firstBoundaryChild = childNode
      break
    }
  }
  firstChild = firstChild || firstBoundaryChild

  const hasFilesChildren = filesChildrenKeys.length > 0
  const boundaries: Record<SegmentBoundaryType, string | null> = {
    'not-found': null,
    loading: null,
    error: null,
    'global-error': null,
  }

  filesChildrenKeys.forEach((childKey) => {
    const childNode = node.children[childKey]
    if (!childNode || !childNode.value) return
    if (isBoundaryFile(childNode.value.type)) {
      const boundaryType = getBoundaryOriginFileType(childNode.value.type)

      if (boundaryType in boundaries) {
        boundaries[boundaryType as keyof typeof boundaries] =
          childNode.value.pagePath || null
      }
    }
  })

  return (
    <>
      {hasFilesChildren && (
        <div
          className="segment-explorer-item"
          data-nextjs-devtool-segment-explorer-segment={segment + '-' + level}
        >
          <div
            className="segment-explorer-item-row"
            style={{
              // If it's children levels, show indents if there's any file at that level.
              // Otherwise it's empty folder, no need to show indents.
              ...{ paddingLeft: `${(level + 1) * 8}px` },
            }}
          >
            <div className="segment-explorer-item-row-main">
              <div className="segment-explorer-filename">
                {folderName && (
                  <span className="segment-explorer-filename--path">
                    {folderName}
                    {/* hidden slashes for testing snapshots */}
                    <small>{'/'}</small>
                  </span>
                )}
                {missingGlobalError && (
                  <SegmentSuggestion
                    possibleExtension={possibleExtension}
                    missingGlobalError={missingGlobalError}
                  />
                )}
                {/* display all the file segments in this level */}
                {filesChildrenKeys.length > 0 && (
                  <span className="segment-explorer-files">
                    {filesChildrenKeys.map((fileChildSegment) => {
                      const childNode = node.children[fileChildSegment]
                      if (!childNode || !childNode.value) {
                        return null
                      }
                      // If it's boundary node, which marks the existence of the boundary not the rendered status,
                      // we don't need to present in the rendered files.
                      if (isBoundaryFile(childNode.value.type)) {
                        return null
                      }
                      // If it's a page/default file, don't show it as a separate label since it's represented by the dropdown button
                      // if (
                      //   childNode.value.type === 'page' ||
                      //   childNode.value.type === 'default'
                      // ) {
                      //   return null
                      // }
                      const filePath = childNode.value.pagePath
                      const lastSegment = filePath.split('/').pop() || ''
                      const isBuiltin = filePath.startsWith(BUILTIN_PREFIX)
                      const fileName = normalizeBoundaryFilename(lastSegment)

                      const tooltipMessage = isBuiltin
                        ? `The default Next.js ${childNode.value.type} is being shown. You can customize this page by adding your own ${fileName} file to the app/ directory.`
                        : null

                      const isOverridden = childNode.value.boundaryType !== null

                      return (
                        <Tooltip
                          key={fileChildSegment}
                          className={
                            'segment-explorer-file-label-tooltip--' +
                            (isBuiltin ? 'lg' : 'sm')
                          }
                          direction={isBuiltin ? 'right' : 'top'}
                          title={tooltipMessage}
                          offset={12}
                        >
                          <FilePill
                            type={childNode.value.type}
                            isBuiltin={isBuiltin}
                            isOverridden={isOverridden}
                            filePath={filePath}
                            fileName={fileName}
                          />
                        </Tooltip>
                      )
                    })}
                  </span>
                )}
                {firstChild && firstChild.value && (
                  <SegmentBoundaryTrigger
                    nodeState={firstChild.value}
                    boundaries={boundaries}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {folderChildrenKeys.map((childSegment) => {
        const child = node.children[childSegment]
        if (!child) {
          return null
        }

        // If it's an folder segment without any files under it,
        // merge it with the segment in the next level.
        const nextSegment = hasFilesChildren
          ? childSegment
          : segment + ' / ' + childSegment
        return (
          <PageSegmentTreeLayerPresentation
            key={childSegment}
            segment={nextSegment}
            node={child}
            level={hasFilesChildren ? level + 1 : level}
          />
        )
      })}
    </>
  )
}

function openInEditor({ filePath }: { filePath: string }) {
  const params = new URLSearchParams({
    file: filePath,
    // Mark the file path is relative to the app directory,
    // The editor launcher will complete the full path for it.
    isAppRelativePath: '1',
  })
  fetch(
    `${
      process.env.__NEXT_ROUTER_BASEPATH || ''
    }/__nextjs_launch-editor?${params.toString()}`
  )
}

export function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z"
        fill="var(--color-gray-400)"
      />
      <path
        d="M7.75 7C8.30228 7.00001 8.75 7.44772 8.75 8V11.25H7.25V8.5H6.25V7H7.75ZM8 4C8.55228 4 9 4.44772 9 5C9 5.55228 8.55228 6 8 6C7.44772 6 7 5.55228 7 5C7 4.44772 7.44772 4 8 4Z"
        fill="var(--color-gray-900)"
      />
    </svg>
  )
}

function BackArrowIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="var(--color-gray-600)"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4.5 11.25C4.5 11.3881 4.61193 11.5 4.75 11.5H14.4395L11.9395 9L13 7.93945L16.7803 11.7197L16.832 11.7764C17.0723 12.0709 17.0549 12.5057 16.7803 12.7803L13 16.5605L11.9395 15.5L14.4395 13H4.75C3.7835 13 3 12.2165 3 11.25V4.25H4.5V11.25Z" />
    </svg>
  )
}

function CodeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="12"
      height="12"
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.22763 14.1819L10.2276 2.18193L10.4095 1.45432L8.95432 1.09052L8.77242 1.81812L5.77242 13.8181L5.59051 14.5457L7.04573 14.9095L7.22763 14.1819ZM3.75002 12.0607L3.21969 11.5304L0.39647 8.70713C0.00594559 8.31661 0.00594559 7.68344 0.39647 7.29292L3.21969 4.46969L3.75002 3.93936L4.81068 5.00002L4.28035 5.53035L1.81068 8.00003L4.28035 10.4697L4.81068 11L3.75002 12.0607ZM12.25 12.0607L12.7804 11.5304L15.6036 8.70713C15.9941 8.31661 15.9941 7.68344 15.6036 7.29292L12.7804 4.46969L12.25 3.93936L11.1894 5.00002L11.7197 5.53035L14.1894 8.00003L11.7197 10.4697L11.1894 11L12.25 12.0607Z"
        fill="currentColor"
      />
    </svg>
  )
}
