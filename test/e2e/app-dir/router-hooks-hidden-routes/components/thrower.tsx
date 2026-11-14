'use client'

import { useState } from 'react'
import { catchError } from 'next/error'
import { notFound } from 'next/navigation'

export type ThrowerAction = 'error' | 'not-found' | 'catch-error'

/**
 * Throws while rendering once its button was clicked. The boundary that
 * catches it unmounts this component, so it renders its button again when the
 * boundary resets.
 */
export function Thrower({
  project,
  action,
}: {
  project: string
  action: ThrowerAction
}) {
  const [thrown, setThrown] = useState(false)
  if (thrown) {
    if (action === 'not-found') {
      notFound()
    }
    throw new Error(`thrown by ${action} in project ${project}`)
  }
  return (
    <button
      data-thrower={`${project}:${action}`}
      onClick={() => setThrown(true)}
    >
      {action}
    </button>
  )
}

export const CatchErrorBoundary = catchError(function CatchErrorFallback() {
  return <p data-boundary="catch-error">catchError boundary</p>
})
