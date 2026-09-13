'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

// A deliberately visible placeholder behind a PNG with transparency.
const blurDataURL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGZpbGw9InJlZCIgZD0iTTAgMGg4djhIMHoiLz48L3N2Zz4='

export default function Images({ broken = false, lazy = false, variant = '' }) {
  const [hydrated, setHydrated] = useState(false)
  const [loads, setLoads] = useState(0)
  const [errors, setErrors] = useState(0)
  const [renders, setRenders] = useState(0)
  const [effectRuns, setEffectRuns] = useState(0)
  const [showImage, setShowImage] = useState(true)
  const [src, setSrc] = useState(broken ? '/broken.png' : '/transparent.png')
  const backgroundStyle =
    variant === 'inline' || variant === 'inline-zero'
      ? {
          backgroundImage: 'linear-gradient(blue, green)',
          backgroundSize: variant === 'inline-zero' ? 0 : '17px 23px',
          backgroundPosition: '12px 19px',
          backgroundRepeat: 'repeat-x',
        }
      : undefined
  const backgroundClass = variant ? `user-background ${variant}` : undefined
  useEffect(() => {
    setHydrated(true)
    setEffectRuns((count) => count + 1)
  }, [])

  return (
    <main>
      {variant && (
        <style>{`
        .user-background {
          background-image: linear-gradient(blue, green);
          background-size: 17px 23px;
          background-position: 12px 19px;
          background-repeat: repeat-x;
        }
        .user-background.important { background-image: linear-gradient(gold, red) !important; }
        .user-background.animation { animation: user-background 100s infinite; }
        @keyframes user-background {
          from, to { background-image: linear-gradient(purple, orange); }
        }
      `}</style>
      )}
      <p id="hydration">{hydrated ? 'hydrated' : 'server'}</p>
      <p id="loads">{loads}</p>
      <p id="errors">{errors}</p>
      <p id="effect-runs">{effectRuns}</p>
      {lazy && <div style={{ height: 3000 }} />}
      <button id="rerender" onClick={() => setRenders(renders + 1)}>
        Rerender {renders}
      </button>
      <button
        id="change-src"
        onClick={() => setSrc('/transparent.png?replacement')}
      >
        Replace image
      </button>
      <button id="remove-image" onClick={() => setShowImage(false)}>
        Remove image
      </button>
      {showImage && (
        <Image
          id="image"
          className={backgroundClass}
          style={backgroundStyle}
          alt="Transparent PNG"
          src={src}
          width={270}
          height={270}
          loading={lazy ? 'lazy' : 'eager'}
          unoptimized
          placeholder="blur"
          blurDataURL={blurDataURL}
          onLoad={() => setLoads((count) => count + 1)}
          onError={broken ? () => setErrors((count) => count + 1) : undefined}
        />
      )}
      {variant && (
        <div
          id="style-reference"
          className={backgroundClass}
          style={backgroundStyle}
        />
      )}
      <Image
        id="second-image"
        alt="Second transparent PNG"
        src="/transparent.png?second"
        width={270}
        height={270}
        loading="eager"
        unoptimized
        placeholder="blur"
        blurDataURL={blurDataURL}
      />
    </main>
  )
}
