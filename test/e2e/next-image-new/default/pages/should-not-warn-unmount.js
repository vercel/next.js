import Image from 'next/image'
import { useEffect, useState } from 'react'

export default function Home() {
  const [displayImage, setDisplayImage] = useState(true)

  useEffect(() => {
    // This will cause the image to unmount.
    // See https://github.com/vercel/next.js/issues/40762
    setDisplayImage(false)
  }, [])

  return (
    <main>
      <h1>Should not warn on unmount</h1>
      <section>
        {displayImage ? (
          <div style={{ position: 'relative', width: 10, height: 10 }}>
            <Image priority fill src="/test.jpg" alt="alt" sizes="10px" />
          </div>
        ) : null}
      </section>
    </main>
  )
}
