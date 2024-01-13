import React from 'react'
import { GoogleAnalytics, sendGAEvent } from '@next/third-parties/google'

const Page = () => {
  const onClick = () => {
    sendGAEvent({ event: 'buttonClicked', value: 'xyz' })
  }

  return (
    <div class="container">
      <GoogleAnalytics gaId="GA-XYZ" />
      <h1>GA</h1>
      <button id="ga-send" onClick={onClick}>
        Click
      </button>
      <GoogleAnalytics gaId="GA-XYZ" />
    </div>
  )
}

export default Page
