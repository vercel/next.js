'use client'
'use no memo'

import { useReducer, useState } from 'react'
import Image from 'next/image'

export default function Page() {
  const [, setErrorEvent] = useState<unknown>(null)
  const [showClientImage, setShowClientImage] = useState(false)
  const [, rerender] = useReducer((i) => i + 1, 0)

  return (
    <>
      <Image
        alt="foo"
        width={5}
        height={5}
        unoptimized
        src="/will-never-exist.png"
        onError={(event) => {
          console.error('hydrated image error')
          // This doesn't really make sense. We just want to check rerendering
          // doesn't infinitely loop
          setErrorEvent(event)
        }}
      />
      <button type="button" onClick={rerender}>
        rerender Page
      </button>
      <button type="button" onClick={() => setShowClientImage(true)}>
        Show Client image
      </button>
      {showClientImage && (
        <Image
          alt="bar"
          width={5}
          height={5}
          unoptimized
          src="/still-doesnt-exist.png"
          onError={(event) => {
            console.error('client rendered image error')
            // This doesn't really make sense. We just want to check rerendering
            // doesn't infinitely loop
            setErrorEvent(event)
          }}
        />
      )}
    </>
  )
}
