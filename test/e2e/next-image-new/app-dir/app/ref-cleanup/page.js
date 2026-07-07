'use client'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'

export default function Home() {
  const [displayImage, setDisplayImage] = useState(true)

  const refWithCleanup = useCallback((el) => {
    if (!el) {
      throw new Error(
        'callback refs that returned a cleanup should never be called with null'
      )
    }

    return () => {
      console.log('callback ref was cleaned up')
    }
  }, [])

  useEffect(() => {
    setDisplayImage(false)
  }, [])

  return (
    <main>
      <h1>Should call ref cleanup on unmount</h1>
      <section>
        {displayImage ? (
          <div style={{ position: 'relative', width: 10, height: 10 }}>
            <Image
              ref={refWithCleanup}
              priority
              fill
              src="/test.jpg"
              alt="alt"
              sizes="10px"
            />
          </div>
        ) : null}
      </section>
    </main>
  )
}
