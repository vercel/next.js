'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function PodcastTeaser({ title, episode, icon }) {
  const [playing, setPlaying] = useState(false)
  return (
    <button
      type="button"
      className="podcast-teaser"
      aria-pressed={playing}
      onClick={() => setPlaying((p) => !p)}
    >
      {icon}
      <span>
        <small className="text-muted">Episode {episode}</small>
        {title}
      </span>
      <span className="text-xs">{playing ? 'Pause' : 'Play'}</span>
    </button>
  )
}
export const __vendor = typeof describeBlogVendor
