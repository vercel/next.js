import React from 'react'
import Image from 'next/image'

// We don't use a static import intentionally
const blurDataURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAAAAABd+vKJAAAANklEQVR42mNg4GRwdWBgZ2BgUGI4dYhBmYFBgiHy308PBlEGKYbr//9fYJBlYDBYv3nzGkUGANGMDBq2MCnBAAAAAElFTkSuQmCC'

export default function Page() {
  return (
    <>
      <h1>Image with fill with blurDataURL</h1>
      <div style={{ position: 'relative', display: 'flex', minHeight: '44vh' }}>
        <Image
          fill
          id="wide-cover"
          alt="wide-cover"
          src="/wide.png"
          placeholder="blur"
          blurDataURL={blurDataURL}
          style={{ objectFit: 'cover' }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', minHeight: '44vh' }}>
        <Image
          fill
          id="wide-contain"
          alt="wide-contain"
          src="/wide.png"
          placeholder="blur"
          blurDataURL={blurDataURL}
          style={{ objectFit: 'contain' }}
        />
      </div>
    </>
  )
}
