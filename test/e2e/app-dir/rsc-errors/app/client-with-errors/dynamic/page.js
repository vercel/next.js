'use client'

import dynamic from 'next/dynamic'

const Component = dynamic(
  async () => () => <p id="dynamic-world">hello dynamic world</p>,
  {
    ssr: false,
  }
)

export default function Page() {
  return (
    <>
      <Component />
    </>
  )
}
