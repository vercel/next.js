import {
  useSegmentTree,
  type SegmentTrieNode,
} from '../../segment-explorer-trie'
import { css } from '../../utils/css'
import { cx } from '../../utils/cx'
import {
  SegmentBoundaryTrigger,
  styles as segmentBoundaryTriggerStyles,
} from './segment-boundary-trigger'
import { Tooltip } from '../../../components/tooltip'
import { useRef, useState, useCallback, useMemo } from 'react'
import {
  BOUNDARY_PREFIX,
  BUILTIN_PREFIX,
  isBoundaryFile,
  normalizeBoundaryFilename,
} from '../../../../server/app-render/segment-explorer-path'
import { ExternalIcon } from '../../icons/external'
import { useDevOverlayContext } from '../../../dev-overlay.browser'

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

export function PageSegmentTree() {
  const tree = useSegmentTree()
  const {state}  = useDevOverlayContext()

  const isAppRouter = state.routerType === 'app'

  
  // Count active boundaries for the badge
  const activeBoundariesCount = useMemo(() => {
    return isAppRouter ? countActiveBoundaries(tree) : 0
  }, [tree, isAppRouter])

  // Global reset handler
  const handleGlobalReset = useCallback(() => {
    if (isAppRouter) {
      traverseTreeAndResetBoundaries(tree)
    }
  }, [tree, isAppRouter])

  return (
    <div data-nextjs-devtools-panel-segments-explorer>
      {isAppRouter && <PageRouteBar page={state.page} />}
      <div
        className="segment-explorer-content"
        data-nextjs-devtool-segment-explorer
      >
        {isAppRouter ? (
          <PageSegmentTreeLayerPresentation node={tree} level={0} segment="" />
        ) : (
          <p>Route Info currently is only available for the App Router.</p>
        )}
      </div>
      {isAppRouter && (
        <SegmentExplorerFooter
          activeBoundariesCount={activeBoundariesCount}
          onGlobalReset={handleGlobalReset}
        />
      )}
    </div>
  )
}

function PageSegmentTreeLayerPresentation({
  segment,
  node,
  level,
}: {
  segment: string
  node: SegmentTrieNode
  level: number
}) {
  const [shadowRoot] = useState<ShadowRoot | null>(() => {
    const portal = document.querySelector('nextjs-portal')
    if (!portal) return null
    return portal.shadowRoot as ShadowRoot
  })
  // This is a workaround as base-ui popup container only accepts shadowRoot when it's in a ref.
  const shadowRootRef = useRef<ShadowRoot>(shadowRoot)
  const childrenKeys = Object.keys(node.children)

  const sortedChildrenKeys = childrenKeys.sort((a, b) => {
    // Prioritize if it's a file convention like layout or page,
    // then the rest parallel routes.
    const aHasExt = a.includes('.')
    const bHasExt = b.includes('.')
    if (aHasExt && !bHasExt) return -1
    if (!aHasExt && bHasExt) return 1
    // Otherwise sort alphabetically

    // If it's file, sort by order: layout > template > page
    if (aHasExt && bHasExt) {
      const aType = node.children[a]?.value?.type
      const bType = node.children[b]?.value?.type

      if (aType === 'layout' && bType !== 'layout') return -1
      if (aType !== 'layout' && bType === 'layout') return 1
      if (aType === 'template' && bType !== 'template') return -1
      if (aType !== 'template' && bType === 'template') return 1

      // non boundary files are prioritized than boundary files
      if (aType && bType) {
        if (isBoundaryFile(aType) && !isBoundaryFile(bType)) return 1
        if (!isBoundaryFile(aType) && isBoundaryFile(bType)) return -1
      }

      // If both are the same type, sort by pagePath
      const aFilePath = node.children[a]?.value?.pagePath || ''
      const bFilePath = node.children[b]?.value?.pagePath || ''
      return aFilePath.localeCompare(bFilePath)
    }

    return a.localeCompare(b)
  })

  // If it's the 1st level and contains a file, use 'app' as the folder name
  const folderName = level === 0 && !segment ? 'app' : segment

  const folderChildrenKeys: string[] = []
  const filesChildrenKeys: string[] = []
  let firstChild = null

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

  for (const fileChildSegment of filesChildrenKeys) {
    const childNode = node.children[fileChildSegment]
    if (!childNode || !childNode.value) continue

    firstChild = childNode
  }

  const hasFilesChildren = filesChildrenKeys.length > 0
  const boundaries: Record<'not-found' | 'loading' | 'error', string | null> = {
    'not-found': null,
    loading: null,
    error: null,
  }

  filesChildrenKeys.forEach((childKey) => {
    const childNode = node.children[childKey]
    if (!childNode || !childNode.value) return
    if (isBoundaryFile(childNode.value.type)) {
      const boundaryType = childNode.value.type.split(':')[1] as
        | 'not-found'
        | 'loading'
        | 'error'
      const boundaryPath = childNode.value.pagePath || null
      if (boundaryPath) {
        boundaries[boundaryType] = boundaryPath.split('/').pop() || ''
      }
    }
  })

  const filesChildrenKeysBesidesSelectedBoundary = filesChildrenKeys.filter(
    (childKey) => {
      const childNode = node.children[childKey]
      if (!childNode || !childNode.value) return true
      const type = childNode.value.type
      const selectedBoundaryType = firstChild?.value?.type?.replace(
        BOUNDARY_PREFIX,
        ''
      )
      if (
        // Filter out the static files that always need to be shown
        type !== 'layout' &&
        type !== 'template' &&
        // Filter out the selected boundary in the trigger, which we don't need to show it again.
        selectedBoundaryType &&
        selectedBoundaryType === type
      ) {
        return false
      }
      return true
    }
  )

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
            <div className="segment-explorer-filename">
              {folderName && (
                <span className="segment-explorer-filename--path">
                  {folderName}
                  {/* hidden slashes for testing snapshots */}
                  <small>{'/'}</small>
                </span>
              )}
              {/* display all the file segments in this level */}
              {filesChildrenKeysBesidesSelectedBoundary.length > 0 && (
                <span className="segment-explorer-files">
                  {filesChildrenKeysBesidesSelectedBoundary.map(
                    (fileChildSegment) => {
                      const childNode = node.children[fileChildSegment]
                      if (!childNode || !childNode.value) {
                        return null
                      }
                      // If it's boundary node, which marks the existence of the boundary not the rendered status,
                      // we don't need to present in the rendered files.
                      if (isBoundaryFile(childNode.value.type)) {
                        return null
                      }
                      // If it's a page file, don't show it as a separate label since it's represented by the dropdown button
                      if (childNode.value.type === 'page') {
                        return null
                      }
                      const filePath = childNode.value.pagePath
                      const lastSegment = filePath.split('/').pop() || ''
                      const isBuiltin = filePath.startsWith(BUILTIN_PREFIX)
                      const fileName = normalizeBoundaryFilename(lastSegment)

                      const tooltipMessage = isBuiltin
                        ? `The default Next.js ${childNode.value.type} is being shown. You can customize this page by adding your own ${fileName} file to the app/ directory.`
                        : null // `Open in editor`

                      return (
                        <Tooltip
                          key={fileChildSegment}
                          className={
                            'segment-explorer-file-label-tooltip--' +
                            (isBuiltin ? 'lg' : 'sm')
                          }
                          direction={isBuiltin ? 'right' : 'top'}
                          title={tooltipMessage}
                          // x-ref: https://github.com/mui/base-ui/issues/2224
                          // @ts-expect-error remove this expect-error once shadowRoot is supported as container
                          container={shadowRootRef}
                          offset={12}
                          bgcolor="var(--color-gray-1000)"
                          color="var(--color-gray-100)"
                        >
                          <span
                            className={cx(
                              'segment-explorer-file-label',
                              `segment-explorer-file-label--${childNode.value.type}`,
                              isBuiltin &&
                                'segment-explorer-file-label--builtin'
                            )}
                            onClick={() => {
                              openInEditor({ filePath })
                            }}
                          >
                            {fileName}
                            {isBuiltin ? <InfoIcon /> : <ExternalIcon />}
                          </span>
                        </Tooltip>
                      )
                    }
                  )}
                </span>
              )}

              {firstChild &&
                firstChild.value &&
                firstChild.value.type !== 'layout' &&
                firstChild.value.type !== 'template' && (
                  <SegmentBoundaryTrigger
                    offset={6}
                    onSelectBoundary={firstChild.value.setBoundaryType}
                    boundaries={boundaries}
                    pagePath={firstChild.value.pagePath}
                    boundaryType={firstChild.value.boundaryType}
                    fileType={firstChild.value.type}
                  />
                )}
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

export const DEV_TOOLS_INFO_RENDER_FILES_STYLES = css`
  .segment-explorer-content {
    font-size: var(--size-14);
    padding: 0 8px;
    min-height: 400px;
  }

  .segment-explorer-page-route-bar {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    background-color: var(--color-background-200);
    gap: 12px;
  }

  .segment-explorer-page-route-bar-path {
    font-size: var(--size-14);
    font-weight: 500;
    color: var(--color-gray-1000);
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  .segment-explorer-item {
    margin: 4px 0;
    border-radius: 6px;
  }

  .segment-explorer-item:nth-child(even) {
    background-color: var(--color-background-200);
  }

  .segment-explorer-item-row {
    display: flex;
    align-items: center;
    padding-top: 10px;
    padding-bottom: 10px;
    padding-right: 4px;
    white-space: pre;
    cursor: default;
    color: var(--color-gray-1000);
  }

  .segment-explorer-children--intended {
    padding-left: 16px;
  }

  .segment-explorer-filename {
    display: inline-flex;
    width: 100%;
    align-items: center;
  }

  .segment-explorer-filename select {
    margin-left: auto;
  }

  .segment-explorer-filename--path {
    margin-right: auto;
  }
  .segment-explorer-filename--path small {
    display: inline-block;
    width: 0;
    opacity: 0;
  }
  .segment-explorer-filename--name {
    color: var(--color-gray-800);
  }

  .segment-explorer-files {
    display: inline-flex;
    gap: 8px;
    margin-left: auto;
  }

  .segment-explorer-files + .segment-boundary-trigger {
    margin-left: 8px;
  }

  .segment-explorer-file-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    border-radius: 6px;
    font-size: 11px;
    line-height: 16px;
    font-size: var(--size-12);
    font-weight: 500;
    user-select: none;
    cursor: pointer;
    background-color: var(--color-gray-300);
    color: var(--color-gray-1000);
  }

  .segment-explorer-file-label:hover {
    background: var(--color-gray-400);
  }

  .segment-explorer-file-label--builtin {
    background-color: transparent;
    color: var(--color-gray-900);
    border: 1px dashed var(--color-gray-500);
    cursor: default;
  }
  .segment-explorer-file-label--builtin svg {
    margin-left: 4px;
    margin-right: -4px;
  }

  /* Footer styles */
  .segment-explorer-footer {
    padding: 8px;
    border-top: 1px solid var(--color-gray-400);
    background-color: var(--color-background-100);
    user-select: none;
  }

  .segment-explorer-footer-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 6px;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-400);
    border-radius: 6px;
    color: var(--color-gray-1000);
    font-size: var(--size-14);
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .segment-explorer-footer-button:hover:not(:disabled) {
    background: var(--color-gray-200);
  }

  .segment-explorer-footer-button--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .segment-explorer-footer-text {
    text-align: center;
  }

  .segment-explorer-footer-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: var(--color-amber-300);
    color: var(--color-amber-900);
    border-radius: 10px;
    font-size: var(--size-12);
    font-weight: 600;
    line-height: 1;
  }

  .segment-explorer-file-label-tooltip--sm {
    white-space: nowrap;
  }

  .segment-explorer-file-label-tooltip--lg {
    min-width: 200px;
  }

  ${segmentBoundaryTriggerStyles}
`

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

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
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
