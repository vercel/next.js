import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <main>
      <h1>Image Priority Test</h1>
      <Image
        id="priority-img"
        src="/test.png"
        priority
        width={100}
        height={100}
        alt="test"
      />
      <Image
        id="lazy-img"
        src="/test.png"
        width={100}
        height={100}
        alt="lazy"
      />
      <Image
        id="override-img"
        src="/test2.png"
        priority
        fetchPriority="low"
        width={100}
        height={100}
        alt="override"
      />
    </main>
  )
}
