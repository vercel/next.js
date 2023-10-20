import React from 'react'
import { GoogleTagManager, sendGTMEvent } from '@next/third-parties/google'

const Page = () => {
  const onClick = () => {
    sendGTMEvent({ event: 'buttonClicked', value: 'xyz' })
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
