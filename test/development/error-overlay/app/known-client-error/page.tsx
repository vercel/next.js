'use client'

import React from 'react'

export default function Page() {
  const [shouldShow, setShouldShow] = React.useState(false)
  if (shouldShow) {
    const error = new Error('Client error!')
    ;(error as any).__NEXT_ERROR_CODE = 'E40'
    throw error
  }

  return (
    <div>
      <button onClick={() => setShouldShow(true)}>break on client</button>
    </div>
  )
}
