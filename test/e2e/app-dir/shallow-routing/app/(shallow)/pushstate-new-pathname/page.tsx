'use client'
import { usePathname } from 'next/navigation'

export default function Page() {
  const pathname = usePathname()
  return (
    <>
      <h1 id="pushstate-pathname">PushState Pathname</h1>
      <pre id="my-data">{pathname}</pre>
      <button
        onClick={() => {
          const url = new URL(window.location.href)
          url.pathname = '/my-non-existent-path'
          window.history.pushState({}, '', url)
        }}
        id="push-pathname"
      >
        Push pathname
      </button>
    </>
  )
}
