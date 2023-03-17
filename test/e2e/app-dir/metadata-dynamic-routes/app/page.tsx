import React from 'react'

export default function Page() {
  return <>hello index</>
}

export const metadata = {
  // TODO-METADATA: auto generate metadataBase for og/tw images, and warn users if they're not configured
  metadataBase: new URL('http://localhost:3000'),
  title: 'index page',
}
