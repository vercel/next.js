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
          window.history.pushState(undefined, '', '/my-non-existent-path')
        }}
        id="push-pathname"
      >
        Push pathname
      </button>
    </>
  )
}
