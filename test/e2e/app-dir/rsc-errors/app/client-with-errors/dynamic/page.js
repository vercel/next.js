'use client'

import dynamic from 'next/dynamic'

const Component = dynamic(async () => undefined, { ssr: false })

export default function Page() {
  return (
    <>
      <Component />
    </>
  )
}
