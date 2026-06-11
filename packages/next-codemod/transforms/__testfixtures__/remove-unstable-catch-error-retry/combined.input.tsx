// @ts-nocheck
/* eslint-disable */
'use client'
import { unstable_catchError, type ErrorInfo } from 'next/error'

function Boundary(props: {}, { error, reset, unstable_retry }: ErrorInfo) {
  return (
    <div>
      <p>{String(error)}</p>
      <button onClick={() => reset()}>Reset</button>
      <button onClick={() => unstable_retry()}>Retry</button>
    </div>
  )
}

export default unstable_catchError(Boundary)
