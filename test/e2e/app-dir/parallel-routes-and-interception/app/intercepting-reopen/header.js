'use client'

import { useRouter } from 'next/navigation'

export default function Header() {
  const router = useRouter()
  return (
    <button
      id="open-search"
      type="button"
      onClick={() => router.push('/intercepting-reopen/search')}
    >
      Open search
    </button>
  )
}
