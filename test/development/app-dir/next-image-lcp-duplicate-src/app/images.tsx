'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

export type LoadingMode = 'eager' | 'preload' | 'priority' | 'lazy'

export default function Images({ loading }: { loading: LoadingMode }) {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const heroProps =
    loading === 'preload'
      ? { preload: true }
      : loading === 'priority'
        ? { priority: true }
        : { loading }

  return (
    <div id="images" data-hydrated={hydrated}>
      <Image
        id="hero"
        src="/hero.jpg"
        alt="Hero"
        width={600}
        height={600}
        {...heroProps}
      />
      <div style={{ height: '300vh' }} />
      <Image
        id="duplicate"
        src="/hero.jpg"
        alt="Duplicate"
        width={600}
        height={600}
        loading={loading === 'lazy' ? 'eager' : undefined}
      />
    </div>
  )
}
