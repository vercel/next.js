'use client'

import dynamic from 'next/dynamic'

const Component = dynamic(async () => () => <p>hello dynamic world</p>, {
  ssr: false,
})

export default function Page() {
  return (
    <>
      <Component />
    </>
  )
}
