'use client'

function Component() {
  if (typeof window === 'undefined') {
    throw new Error('SSR only error')
  }
  return <p>hello world</p>
}

export default function Page() {
  return <Component />
}
