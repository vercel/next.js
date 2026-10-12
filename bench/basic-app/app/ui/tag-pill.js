'use client'
export default function TagPill({ tag, onSelect }) {
  return (
    <button type="button" className="tag-pill" onClick={() => onSelect?.(tag)}>
      {tag}
    </button>
  )
}
