'use client'

export default function Page() {
  return typeof window === 'undefined' ? 'server' : 'client'
}
