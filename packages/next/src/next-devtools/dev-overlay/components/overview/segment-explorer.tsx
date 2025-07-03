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
import { useRef, useState } from 'react'

const BUILTIN_PREFIX = '__next_builtin__'

const isFileNode = (node: SegmentTrieNode) => {
  return !!node.value?.type && !!node.value?.pagePath
}

function PageRouteBar({ page }: { page: string }) {
  return (
    <div className="segment-explorer-page-route-bar">
      <BackArrowIcon />
      <span className="segment-explorer-page-route-bar-path">{page}</span>
    </div>
  )
}

export function PageSegmentTree({
  isAppRouter,
  page,
}: {
  isAppRouter: boolean
  page: string
}) {
  const tree = useSegmentTree()
  return (
    <div data-nextjs-devtools-panel-segments-explorer>
      {isAppRouter && <PageRouteBar page={page} />}
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
  let pageChild = null

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

    // If it's a page node, we can use it as the page child
    if (
      childNode.value.type !== 'layout' &&
      childNode.value.type !== 'template'
    ) {
      pageChild = childNode
      break // We only need one page child
    }
  }

  const hasFilesChildren = filesChildrenKeys.length > 0

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
              {filesChildrenKeys.length > 0 && (
                <span className="segment-explorer-files">
                  {filesChildrenKeys.map((fileChildSegment) => {
                    const childNode = node.children[fileChildSegment]
                    if (!childNode || !childNode.value) {
                      return null
                    }
                    const filePath = childNode.value.pagePath
                    const lastSegment = filePath.split('/').pop() || ''
                    const isBuiltin = filePath.startsWith(BUILTIN_PREFIX)
                    const fileName = lastSegment.replace(BUILTIN_PREFIX, '')

                    return (
                      <span
                        key={fileChildSegment}
                        onClick={() => {
                          if (isBuiltin) return
                          openInEditor({ filePath })
                        }}
                        className={cx(
                          'segment-explorer-file-label',
                          `segment-explorer-file-label--${childNode.value.type}`,
                          isBuiltin && 'segment-explorer-file-label--builtin'
                        )}
                      >
                        {fileName}
                        {isBuiltin && (
                          <Tooltip
                            direction="right"
                            title={`The default Next.js not found is being shown. You can customize this page by adding your own ${fileName} file to the app/ directory.`}
                            // x-ref: https://github.com/mui/base-ui/issues/2224
                            // @ts-expect-error remove this expect-error once shadowRoot is supported as container
                            container={shadowRootRef}
                            offset={12}
                            bgcolor="var(--color-gray-1000)"
                            color="var(--color-gray-100)"
                          >
                            <InfoIcon />
                          </Tooltip>
                        )}
                      </span>
                    )
                  })}
                </span>
              )}
              {/* TODO: only show triggers in dev panel remove this once the new panel UI is stable */}
              {pageChild && pageChild.value && (
                <SegmentBoundaryTrigger
                  offset={6}
                  onSelectBoundary={pageChild.value.setBoundaryType}
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
    margin-right: 8px;
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
  }

  .segment-explorer-file-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    padding: 2px 6px;
    border-radius: 16px;
    font-size: var(--size-12);
    font-weight: 500;
    user-select: none;
    cursor: pointer;
  }

  .segment-explorer-file-label:hover {
    filter: brightness(1.05);
  }

  .segment-explorer-file-label--layout,
  .segment-explorer-file-label--template,
  .segment-explorer-file-label--default {
    background-color: var(--color-gray-300);
    color: var(--color-gray-1000);
  }
  .segment-explorer-file-label--page {
    background-color: var(--color-blue-300);
    color: var(--color-blue-900);
  }
  .segment-explorer-file-label--not-found,
  .segment-explorer-file-label--forbidden,
  .segment-explorer-file-label--unauthorized {
    background-color: var(--color-amber-300);
    color: var(--color-amber-900);
  }
  .segment-explorer-file-label--loading {
    background-color: var(--color-green-300);
    color: var(--color-green-900);
  }
  .segment-explorer-file-label--error,
  .segment-explorer-file-label--global-error {
    background-color: var(--color-red-300);
    color: var(--color-red-900);
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
