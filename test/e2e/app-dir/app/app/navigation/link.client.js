import { useRouter } from 'next/dist/client/components/hooks-client'
import React from 'react'
import { useEffect } from 'react'
export default function HardLink({ href, children, ...props }) {
  const router = useRouter()
  useEffect(() => {
    router.prefetch(href)
  }, [router, href])
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        e.preventDefault()
        React.startTransition(() => {
          router.push(href)
          router.reload()
        })
      }}
    >
      {children}
    </a>
  )
}
