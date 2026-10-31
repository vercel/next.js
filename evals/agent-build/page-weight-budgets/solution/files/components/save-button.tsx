'use client'

import { useState } from 'react'
import { Icon } from '@/components/icon'

export function SaveButton({ name }: { name: string }) {
  const [saved, setSaved] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={`Save ${name}`}
      onClick={() => setSaved(!saved)}
    >
      <Icon name={saved ? 'heart-filled' : 'heart'} />
    </button>
  )
}
