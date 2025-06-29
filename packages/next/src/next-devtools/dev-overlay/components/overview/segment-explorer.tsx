import { useSegmentTree, type SegmentTrieNode } from '../../segment-explorer'
import { css } from '../../utils/css'
import { cx } from '../../utils/cx'

const BUILTIN_PREFIX = '__next_builtin__'

const isFileNode = (node: SegmentTrieNode) => {
  return !!node.value?.type && !!node.value?.pagePath
}

export function PageSegmentTree({ isAppRouter }: { isAppRouter: boolean }) {
  const tree = useSegmentTree()
  return (
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
                          <TooltipSpan
                            title={`The default Next.js not found is being shown. You can customize this page by adding your own ${fileName} file to the app/ directory.`}
                          >
                            <InfoIcon />
                          </TooltipSpan>
                        )}
                      </span>
                    )
                  })}
                </span>
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
  }

  .segment-explorer-file-label--builtin svg {
    margin-left: 4px;
    margin-right: -4px;
  }
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

function TooltipSpan({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return <span title={title}>{children}</span>
}
