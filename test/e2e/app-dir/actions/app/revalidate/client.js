'use client'

import { useRouter } from 'next/navigation'

export default function RedirectClientComponent({ action }) {
  const router = useRouter()
  return (
    <button
      id="redirect-revalidate-client"
      onClick={async () => {
        await action()
        router.push('/revalidate?foo=bar')
      }}
    >
      redirect + revalidate (client component)
    </button>
  )
}
