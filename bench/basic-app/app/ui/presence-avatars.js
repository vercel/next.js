'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function PresenceAvatars({ people }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? people : people.slice(0, 3)
  return (
    <button
      type="button"
      className="presence"
      aria-label={people.length + ' teammates online'}
      onClick={() => setExpanded((e) => !e)}
    >
      {shown.map((p) => (
        <span
          key={p.username}
          className="presence-dot"
          style={{ background: `hsl(${p.avatarHue} 60% 55%)` }}
          title={p.name}
        >
          {p.name[0]}
        </span>
      ))}
      {!expanded && people.length > 3 ? (
        <span className="presence-more">+{people.length - 3}</span>
      ) : null}
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
