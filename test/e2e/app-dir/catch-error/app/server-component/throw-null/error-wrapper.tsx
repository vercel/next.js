'use client'

import type { ErrorInfo } from 'next/error'
import { unstable_catchError } from 'next/error'

function ErrorFallback(_props: {}, { error }: ErrorInfo) {
  return <p id="error-boundary-message">{`An error occurred: ${error}`}</p>
}

export default unstable_catchError(ErrorFallback)
