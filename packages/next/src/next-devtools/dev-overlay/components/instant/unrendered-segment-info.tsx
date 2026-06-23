import { useCallback } from 'react'
import { FileIcon } from '../../icons/file'
import { CodeFrameShell } from '../code-frame/code-frame-shell'
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

  const fileExtension = firstMissingFile?.split('.').pop() ?? undefined
  return (
    <CodeFrameShell
      header={
        <>
          <span className="code-frame-icon">
            <FileIcon lang={fileExtension} />
          </span>
          <span data-text>{route}</span>
        </>
      }
      onOpen={firstMissingFile ? open : undefined}
      openLabel={
        firstMissingFile ? `Open ${firstMissingFile} in editor` : undefined
      }
    >
      <div data-nextjs-unrendered-segment-tree>
        <div data-nextjs-codeframe-line="">
          <span data-nextjs-unrendered-segment-tree-prefix>│</span>
        </div>
        {nodes.map((node, i) => (
          <TreeRow key={i} node={node} />
        ))}
        <div data-nextjs-codeframe-line="">
          <span data-nextjs-unrendered-segment-tree-prefix>│</span>
        </div>
      </div>
    </CodeFrameShell>
  )
}

function TreeRow({ node }: { node: TreeNode }) {
  const lineProps: Record<string, string | boolean> = {
    'data-nextjs-codeframe-line': '',
  }
  if (node.isMissing) {
    lineProps['data-nextjs-codeframe-line--errored'] = true
  }

  let prefix = '│ '
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
          ← dropped from rendering
        </span>
      )}
    </div>
  )
}

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
  [data-nextjs-unrendered-segment-tree-prefix] {
    color: var(--color-gray-alpha-700) !important;
  }

  [data-nextjs-unrendered-segment-tree]
    [data-nextjs-codeframe-line--errored='true']
    [data-nextjs-unrendered-segment-tree-prefix] {
    color: var(--color-gray-alpha-1000) !important;
  }

  [data-nextjs-unrendered-segment-tree-pointer] {
    color: var(--color-red-900) !important;
    margin-left: 8px;
    white-space: pre;
  }
`
