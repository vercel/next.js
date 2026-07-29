import NextImage, { getImageProps } from 'next/image.js'
import Link from 'next/link.js'
import * as NextError from 'next/error.js'
import { redirect } from 'next/navigation.js'
import Script from 'next/script.js'

import src from '../../public/test.jpg'

function getCatchErrorMessage() {
  try {
    NextError.catchError()
  } catch (error) {
    return error.message
  }
}

export function Components() {
  return (
    <>
      <NextImage className="img" src={src} />
      <p className="typeof-getImageProps">{typeof getImageProps}</p>
      <p className="catch-error-message">{getCatchErrorMessage()}</p>
      <p className="typeof-redirect">{typeof redirect}</p>
      <Link className="link" href="/client">
        link
      </Link>
      <Script className="script" src="/test-ext.js" />
    </>
  )
}
