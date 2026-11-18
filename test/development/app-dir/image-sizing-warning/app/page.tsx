'use client'

import Image from 'next/image'
import type { CSSProperties, SyntheticEvent } from 'react'
import './style.css'

type ImageCase = {
  id: string
  columnWidth?: number
  objectFit?: CSSProperties['objectFit']
  width?: number
  height?: number
  src?: string
  className?: string
}

const cases: ImageCase[] = [
  { id: 'cover' },
  { id: 'cover-neighbor', objectFit: 'cover', columnWidth: 681 },
  { id: 'contain', objectFit: 'contain' },
  { id: 'none', objectFit: 'none' },
  { id: 'scale-down', objectFit: 'scale-down' },
  { id: 'fill', objectFit: 'fill' },
  { id: 'default' },
  { id: 'fill-neighbor', columnWidth: 681 },
  { id: 'height-only', columnWidth: 820, className: 'height-only' },
  // The file is 820 x 720, but its height prop differs from the source.
  {
    id: 'source-mismatch',
    columnWidth: 820,
    height: 700,
    className: 'natural-ratio',
  },
  {
    id: 'fractional',
    columnWidth: 75,
    width: 75,
    height: 37,
    src: '/fractional.svg',
    className: 'natural-ratio',
  },
  {
    id: 'fractional-wide',
    columnWidth: 75,
    width: 75,
    height: 7,
    src: '/fractional-wide.svg',
    className: 'natural-ratio',
  },
  {
    id: 'fractional-tall',
    columnWidth: 20,
    width: 7,
    height: 75,
    src: '/fractional-tall.svg',
    className: 'natural-width',
  },
  { id: 'proportional', width: 410, height: 360, className: 'fixed-props' },
  { id: 'props-stretched', width: 820, height: 360, className: 'fixed-props' },
]

function onLoad(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.dataset.loaded = 'true'
}

export default function Page() {
  return (
    <>
      {cases.map(
        ({
          id,
          columnWidth = 680,
          objectFit,
          width = 820,
          height = 720,
          src = '/sample.png',
          className = 'aspect-ratio',
        }) => (
          <div
            key={id}
            style={{ display: 'grid', gridTemplateColumns: `${columnWidth}px` }}
          >
            <Image
              id={id}
              src={`${src}?case=${id}`}
              alt="Grid with circles"
              width={width}
              height={height}
              loading="eager"
              className={className}
              style={{ objectFit }}
              onLoad={onLoad}
            />
          </div>
        )
      )}
      <Image
        id="density-rounded"
        src="/sample.png?case=density-rounded"
        sizes="66px"
        alt="Grid with circles"
        width={1640}
        height={1440}
        loading="eager"
        onLoad={onLoad}
      />
      <div style={{ position: 'relative', width: 680, height: 720 }}>
        <Image
          id="fill-prop"
          src="/sample.png?case=fill-prop"
          alt="Grid with circles"
          fill
          sizes="680px"
          loading="eager"
          onLoad={onLoad}
        />
      </div>
    </>
  )
}
