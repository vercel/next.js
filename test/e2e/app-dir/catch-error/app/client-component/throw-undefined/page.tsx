'use client'

import { useState } from 'react'
import type { ErrorInfo } from 'next/error'
import { unstable_catchError } from 'next/error'

function Inner() {
  const [clicked, setClicked] = useState(false)
  if (clicked) {
    // eslint-disable-next-line no-throw-literal -- testing bad values on purpose
    throw undefined
  }
  return (
    <button
      id="error-trigger-button"
      onClick={() => {
        setClicked(true)
      }}
    >
      Trigger Error!
    </button>
  )
}

function ErrorFallback(_props: {}, { error }: ErrorInfo) {
  return <p id="error-boundary-message">{`An error occurred: ${error}`}</p>
}

const Wrapped = unstable_catchError(ErrorFallback)

export default function Page() {
  return (
    <Wrapped>
      <Inner />
    </Wrapped>
  )
}
