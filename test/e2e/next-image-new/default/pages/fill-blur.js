import React from 'react'
import Image from 'next/image'

// We don't use a static import intentionally
const blurDataURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAAAAABd+vKJAAAANklEQVR42mNg4GRwdWBgZ2BgUGI4dYhBmYFBgiHy308PBlEGKYbr//9fYJBlYDBYv3nzGkUGANGMDBq2MCnBAAAAAElFTkSuQmCC'

export default function Page() {
  return (
    <>
      <p>Image with fill with blurDataURL</p>
      <div style={{ position: 'relative', display: 'flex', minHeight: '30vh' }}>
        <Image
          fill
          alt="alt"
          src="/wide.png"
          placeholder="blur"
          blurDataURL={blurDataURL}
          id="fit-cover"
          style={{ objectFit: 'cover' }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', minHeight: '30vh' }}>
        <Image
          fill
          alt="alt"
          src="/wide.png"
          placeholder="blur"
          blurDataURL={blurDataURL}
          id="fit-contain"
          style={{ objectFit: 'contain' }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', minHeight: '30vh' }}>
        <Image
          fill
          alt="alt"
          src="/wide.png"
          placeholder="blur"
          blurDataURL={blurDataURL}
          id="fit-fill"
          style={{ objectFit: 'fill' }}
        />
      </div>
    </>
  )
}
