'use client'

import Image from 'next/image'
import './style.css'

const cases = [
  { id: 'cover' },
  { id: 'cover-neighbor', objectFit: 'cover', width: 681 },
  { id: 'contain', objectFit: 'contain' },
  { id: 'none', objectFit: 'none' },
  { id: 'scale-down', objectFit: 'scale-down' },
  { id: 'fill', objectFit: 'fill' },
  { id: 'default' },
  { id: 'height-only', width: 820 },
] as const

export default function Page() {
  return cases.map(({ id, ...props }) => (
    <div
      key={id}
      style={{
        display: 'grid',
        gridTemplateColumns: `${'width' in props ? props.width : 680}px`,
      }}
    >
      <Image
        id={id}
        src={`/sample.png?case=${id}`}
        alt="Grid with circles"
        width={820}
        height={720}
        loading="eager"
        className={id === 'height-only' ? 'height-only' : 'aspect-ratio'}
        style={{
          objectFit: 'objectFit' in props ? props.objectFit : undefined,
        }}
        onLoad={(event) => {
          event.currentTarget.dataset.loaded = 'true'
        }}
      />
    </div>
  ))
}
