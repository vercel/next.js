'use client'
import { usePathname } from 'next/navigation'

export default function Page() {
  const pathname = usePathname()
  return (
    <>
      <h1 id="replacestate-pathname">ReplaceState Pathname</h1>
      <pre id="my-data">{pathname}</pre>
      <button
        onClick={() => {
          window.history.replaceState(null, '', '/my-non-existent-path')
        }}
        id="replace-pathname"
      >
        Push pathname
      </button>
    </>
  )
}
