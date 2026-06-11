// @ts-nocheck
/* eslint-disable */
'use client'
import { catchError, type ErrorInfo } from 'next/error'

function Boundary(props: {}, { error, reset, retry }: ErrorInfo) {
  return (
    (<div>
      <p>{String(error)}</p>
      <button onClick={() => reset()}>Reset</button>
      <button onClick={() => retry()}>Retry</button>
    </div>)
  );
}

export default catchError(Boundary)
