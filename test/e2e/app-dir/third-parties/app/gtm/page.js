'use client'

import React from 'react'
import {
  GoogleTagManager,
  useGoogleTagManager,
} from '@next/third-parties/google'

const Page = () => {
  const { sendData } = useGoogleTagManager()

  const onClick = () => {
    sendData({ event: 'buttonClicked', value: 'xyz' })
  }

  return (
    <div class="container">
      <GoogleTagManager gtmId="GTM-XYZ" />
      <h1>GTM</h1>
      <button id="gtm-send" onClick={onClick}>
        Click
      </button>
      <GoogleTagManager gtmId="GTM-XYZ" />
    </div>
  )
}

export default Page
