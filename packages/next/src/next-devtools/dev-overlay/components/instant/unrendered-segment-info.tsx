import { useCallback } from 'react'
import { ExternalIcon } from '../../icons/external'
import { css } from '../../utils/css'

type UnrenderedSegmentInfoProps = {
  route: string
  files: string[]
}

type TreeNode = {
  label: string
  depth: number
  isLastSibling: boolean
  pipeMask: boolean[]
  isMissing: boolean
}

export function UnrenderedSegmentInfo({
  route,
  files,
}: UnrenderedSegmentInfoProps) {
  const nodes = buildTree(route, files)
  // Open the first unrendered file when the user clicks the header
  // open-in-editor button. There's typically only one.
  const firstMissingFile = files[0] ?? null
  const open = useCallback(() => {
    if (!firstMissingFile) return
    const relative = firstMissingFile.replace(/^.*?app\//, '')
    const params = new URLSearchParams()
    params.append('file', relative)
    params.append('isAppRelativePath', '1')
    self
      .fetch(
        `${
          process.env.__NEXT_ROUTER_BASEPATH || ''
        }/__nextjs_launch-editor?${params.toString()}`
      )
      .then(
        () => {},
        (cause) => {
          console.error(
            `Failed to open file "${firstMissingFile}" in your editor. Cause:`,
            cause
          )
        }
      )
  }, [firstMissingFile])

  return (
    <div data-nextjs-unrendered-segment-tree>
      <div className="code-frame-header">
        <p className="code-frame-link">
          <span data-nextjs-unrendered-segment-tree-label>Route</span>
          <span data-text>{route}</span>
          {firstMissingFile && (
            <button
              aria-label={`Open ${firstMissingFile} in editor`}
              data-with-open-in-editor-link-source-file
              onClick={open}
              type="button"
            >
              <ExternalIcon />
            </button>
          )}
        </p>
      </div>
      <pre className="code-frame-pre">
        <div className="code-frame-lines">
          {nodes.map((node, i) => (
            <TreeRow key={i} node={node} />
          ))}
        </div>
      </pre>
    </div>
  )
}

function TreeRow({ node }: { node: TreeNode }) {
  const lineProps: Record<string, string | boolean> = {
    'data-nextjs-codeframe-line': '',
  }
  if (node.isMissing) {
    lineProps['data-nextjs-codeframe-line--errored'] = true
  }

  let prefix = ''
  for (let i = 0; i < node.depth; i++) {
    prefix += node.pipeMask[i] ? '   ' : '│  '
  }
  prefix += node.isLastSibling ? '└─ ' : '├─ '

  return (
    <div {...lineProps}>
      <span data-nextjs-unrendered-segment-tree-prefix>{prefix}</span>
      <span>{node.label}</span>
      {node.isMissing && (
        <span data-nextjs-unrendered-segment-tree-pointer>
          {' '}
          ← dropped segment
        </span>
      )}
    </div>
  )
}

/**
 * Build the route tree from the framework-provided route + missing files.
 * Paths are sliced at the route entry segment so leading `app/` (or a
 * `<srcDir>/app/` / monorepo prefix) is dropped.
 */
function buildTree(route: string, files: string[]): TreeNode[] {
  type Raw = {
    key: string
    parts: string[]
    isLeaf: boolean
  }

  const routeFirstSegment = route.split('/').filter(Boolean)[0]

  const allKeys = new Set<string>()
  const leafKeys = new Set<string>()

  for (const file of files) {
    let parts = file.split('/').filter(Boolean)
    if (parts.length === 0) continue
    if (routeFirstSegment) {
      const anchor = parts.indexOf(routeFirstSegment)
      if (anchor >= 0) parts = parts.slice(anchor)
    }
    for (let i = 1; i < parts.length; i++) {
      allKeys.add(parts.slice(0, i).join('/'))
    }
    const leafKey = parts.join('/')
    allKeys.add(leafKey)
    leafKeys.add(leafKey)
  }

  const sortedKeys = Array.from(allKeys).sort()

  const raw: Raw[] = sortedKeys.map((key) => {
    const parts = key.split('/')
    const isLeaf = leafKeys.has(key)
    return { key, parts, isLeaf }
  })

  const isLastSiblingAt = (idx: number, depth: number) =>
    !raw.some(
      (other, otherIdx) =>
        otherIdx > idx &&
        other.parts.length > depth &&
        other.parts.slice(0, depth).join('/') ===
          raw[idx].parts.slice(0, depth).join('/')
    )

  return raw.map((row, idx) => {
    const depth = row.parts.length - 1
    const isLastSibling = isLastSiblingAt(idx, depth)
    const pipeMask: boolean[] = []
    for (let d = 0; d < depth; d++) {
      pipeMask.push(isLastSiblingAt(idx, d))
    }
    const label =
      depth === 0 || !row.isLeaf ? `${row.parts[depth]}/` : row.parts[depth]
    return {
      label,
      depth,
      isLastSibling,
      pipeMask,
      isMissing: row.isLeaf,
    }
  })
}

export const UNRENDERED_SEGMENT_INFO_STYLES = css`
  [data-nextjs-unrendered-segment-tree] {
    --code-frame-padding: 12px;
    --code-frame-line-height: var(--size-20);
    background-color: var(--color-background-200);
    color: var(--color-gray-1000);
    text-overflow: ellipsis;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-13);
    line-height: var(--code-frame-line-height);
    margin: 16px 0;
    overflow: hidden;
  }

  [data-nextjs-unrendered-segment-tree] .code-frame-link {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    outline: 0;
    padding: 8px 8px 8px 12px;
  }

  [data-nextjs-unrendered-segment-tree-label] {
    color: var(--color-gray-900);
    flex-shrink: 0;
    font-family: var(--font-stack-sans);
    font-size: var(--size-12);
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  [data-nextjs-unrendered-segment-tree] .code-frame-link [data-text] {
    flex: 1;
    font-size: var(--size-12);
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [data-nextjs-unrendered-segment-tree] .code-frame-pre {
    overflow-x: auto;
    overflow-y: hidden;
    display: block;
    max-width: 100%;
    margin: 0;
  }

  [data-nextjs-unrendered-segment-tree] .code-frame-lines {
    padding: 0 var(--code-frame-padding) var(--code-frame-padding);
  }

  [data-nextjs-unrendered-segment-tree] [data-nextjs-codeframe-line] {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--code-frame-line-height);
    line-height: var(--code-frame-line-height);
  }

  [data-nextjs-unrendered-segment-tree]::selection,
  [data-nextjs-unrendered-segment-tree] *::selection {
    background-color: var(--color-ansi-selection);
  }

  [data-nextjs-unrendered-segment-tree] [data-nextjs-codeframe-line] > span {
    font-family: var(--font-stack-monospace);
    font-size: var(--size-12);
    white-space: pre;
  }

  [data-nextjs-unrendered-segment-tree-prefix] {
    color: var(--color-gray-alpha-700) !important;
  }

  [data-nextjs-unrendered-segment-tree]
    [data-nextjs-codeframe-line][data-nextjs-codeframe-line--errored='true'] {
    position: relative;
    isolation: isolate;

    > * {
      position: relative;
      z-index: 1;
    }

    &::after {
      content: '';
      top: 0;
      left: calc(-1 * var(--code-frame-padding));
      width: calc(100% + var(--code-frame-padding) * 2);
      height: 100%;
      background: var(--color-red-200);
      box-shadow: 2px 0 0 0 var(--color-red-900) inset;
      position: absolute;
      z-index: 0;
    }
  }

  [data-nextjs-unrendered-segment-tree-pointer] {
    color: var(--color-red-900);
    margin-left: 8px;
    white-space: pre;
  }

  [data-nextjs-unrendered-segment-tree]
    [data-with-open-in-editor-link-source-file] {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-24);
    height: var(--size-24);
    padding: 4px;
    margin-left: auto;
    border-radius: var(--rounded-full);
    background: none;
    border: 0;
    color: var(--color-gray-900);
    cursor: pointer;

    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: -2px;
    }

    &:hover {
      background: var(--color-gray-alpha-100);
    }

    &:active {
      background: var(--color-gray-alpha-200);
    }
  }

  [data-nextjs-unrendered-segment-tree]
    [data-with-open-in-editor-link-source-file]
    svg {
    width: var(--size-14);
    height: var(--size-14);
  }
`
