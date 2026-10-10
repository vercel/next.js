'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function VideoEmbed({ title, duration, playIcon, hue }) {
  const [playing, setPlaying] = useState(false)
  return (
    <button
      type="button"
      className="video-embed"
      data-playing={playing}
      style={{ background: `hsl(${hue} 40% 20%)` }}
      onClick={() => setPlaying(true)}
    >
      {playIcon}
      <span className="video-title">{title}</span>
      <span className="text-xs text-muted">{duration}</span>
    </button>
  )
}
export const __vendor = typeof describeBlogVendor
