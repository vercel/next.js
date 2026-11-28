import React from 'react'
import { GoogleTagManager } from '@next/third-parties/google'

const Page = () => {
  return (
    <div>
      <GoogleTagManager
        gtmId="GTM-XYZ"
        dataLayer={{ user_id: 'user-123' }}
      />
      <h1>GTM with dataLayer</h1>
    </div>
  )
}

export default Page
