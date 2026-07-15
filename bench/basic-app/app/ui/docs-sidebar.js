'use client'
import { describeUtils } from './vendor-util'
import { fixtureName } from './vendor-fixtures'
import { useState } from 'react'

function Node({ node, depth }) {
  const [open, setOpen] = useState(depth < 1)
  return (
    <li>
      <a
        href={node.path}
        title={node.description}
        className="flex items-center gap-2 truncate text-sm"
        onClick={(e) => {
          if (node.children.length > 0) {
            e.preventDefault()
            setOpen(!open)
          }
        }}
      >
        {node.title}
      </a>
      {open && node.children.length > 0 ? (
        <ul>
          {node.children.map((c) => (
            <Node key={c.path} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default function DocsSidebar({ tree, version }) {
  const [selected, setSelected] = useState(version)
  const nodes = tree[selected] ?? []
  return (
    <nav className="docs-nav" aria-label="Docs navigation">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="version-select"
      >
        {Object.keys(tree).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <ul className="docs-tree">
        {nodes.map((n) => (
          <Node key={n.path} node={n} depth={0} />
        ))}
      </ul>
    </nav>
  )
}

export const __layers = [describeUtils, fixtureName].length
