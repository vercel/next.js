'use client'

import * as React from 'react'

// Lets the test wait until the page has been hydrated, so that submitting
// `#next-form` is guaranteed to go through `<Form>`'s submit handler (instead
// of the browser's default form submission).
export default function HydrationMarker() {
  const [hydrated, setHydrated] = React.useState(false)
  React.useEffect(() => setHydrated(true), [])
  return hydrated ? <span id="hydrated">true</span> : null
}
