'use client'

export default function Page() {
  console.error(
    'ssr console error:' + (typeof window === 'undefined' ? 'server' : 'client')
  )
  if (typeof window === 'undefined') {
  }
  return <p>ssr</p>
}
