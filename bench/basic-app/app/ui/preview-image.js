'use client'
import { useState } from 'react'
// Renders like an image component: blur placeholder swapped for the real
// asset on load; here the "real" asset never resolves so the placeholder
// stays, but the metadata travels like production image props.
export default function PreviewImage({ image, alt }) {
  const [loaded] = useState(false)
  return (
    <span
      className="preview-image"
      style={{
        aspectRatio: image.width + ' / ' + image.height,
        backgroundImage: loaded ? undefined : 'url(' + image.blurDataURL + ')',
      }}
      role="img"
      aria-label={alt}
      data-src={image.src}
      data-srcset={image.srcSet}
    />
  )
}
