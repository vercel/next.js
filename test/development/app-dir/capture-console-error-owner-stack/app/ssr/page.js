'use client'

export default function Page() {
  console.error(
    'ssr console error:' + (typeof window === 'undefined' ? 'server' : 'client')
  )
  return <p>ssr</p>
}
