'use client'

import React from 'react'
import { useFormStatus } from 'react-dom'

export function Button({
  children,
  id,
}: React.PropsWithChildren<{ id: string }>) {
  const { pending } = useFormStatus()

  return (
    <button id={id} disabled={pending}>
      {children}
    </button>
  )
}
