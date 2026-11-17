'use client'

import { useRouter } from 'next/navigation'

export function Nav() {
  const router = useRouter()
  return (
    <nav>
      {['/b/1', '/c', '/b/2'].map((href) => (
        <button
          key={href}
          id={`go${href.replaceAll('/', '-')}`}
          onClick={() => router.push(href)}
        >
          Go to {href}
        </button>
      ))}
    </nav>
  )
}
