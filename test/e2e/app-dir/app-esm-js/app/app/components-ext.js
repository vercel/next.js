import NextImage, { getImageProps } from 'next/image.js'
import Link from 'next/link.js'
import Script from 'next/script.js'

import src from '../../public/test.jpg'

export function Components() {
  return (
    <>
      <NextImage className="img" src={src} />
      <p className="typeof-getImageProps">{typeof getImageProps}</p>
      <Link className="link" href="/client">
        link
      </Link>
      <Script className="script" src="/test-ext.js" />
    </>
  )
}
