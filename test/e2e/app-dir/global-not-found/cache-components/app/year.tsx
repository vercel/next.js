'use client'
import { Suspense } from 'react'

export function Year() {
  return <Suspense>{new Date().getFullYear()}</Suspense>
}
