'use client'

import Image from 'next/image'
import { useState } from 'react'

export function Gallery({ name, photos }: { name: string; photos: string[] }) {
  const [photo, setPhoto] = useState(photos[0])
  return (
    <div>
      <Image
        src={photo}
        alt={name}
        width={560}
        height={560}
        sizes="560px"
        priority
        className="product-photo"
      />
      <div className="thumbs">
        {photos.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Show photo ${i + 1}`}
            onClick={() => setPhoto(src)}
          >
            <Image
              src={src}
              alt=""
              width={120}
              height={120}
              sizes="120px"
              className="thumb-photo"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
