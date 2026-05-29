import NextImage, { getImageProps } from 'next/image'
import Link from 'next/link'
import Script from 'next/script'

import src from '../../public/test.jpg'

export function Components() {
  return (
    <>
      <NextImage className="img" src={src} />
      <p className="typeof-getImageProps">{typeof getImageProps}</p>
      <Link className="link" href="/client">
        link
      </Link>
      <Script className="script" src="/test.js" />
    </>
  )
}
