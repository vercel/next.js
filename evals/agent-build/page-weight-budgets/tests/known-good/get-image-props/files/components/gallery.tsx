'use client'

import { useState } from 'react'

type ImgProps = React.ComponentProps<'img'>

// Image props come from getImageProps on the server, so no image code ships to the client.
export function Gallery({
  photos,
}: {
  photos: { src: string; main: ImgProps; thumb: ImgProps }[]
}) {
  const [index, setIndex] = useState(0)
  return (
    <div>
      <img {...photos[index].main} />
      <div className="thumbs">
        {photos.map((photo, i) => (
          <button
            key={photo.src}
            type="button"
            aria-label={`Show photo ${i + 1}`}
            onClick={() => setIndex(i)}
          >
            <img {...photo.thumb} />
          </button>
        ))}
      </div>
    </div>
  )
}
