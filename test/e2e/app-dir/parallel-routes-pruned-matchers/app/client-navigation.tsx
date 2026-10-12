'use client'

import { useRouter } from 'next/navigation'

export function ClientNavigation({ paths }: { paths: string[] }) {
  const router = useRouter()

  return paths.map((path) => (
    <button
      key={path}
      data-router-push={path}
      onClick={() => router.push(path)}
    >
      Navigate to {path}
    </button>
  ))
}
