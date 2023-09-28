// 'use client'
import React, { useEffect } from 'react'

export default function Page() {
  // const ref = React.useRef<HTMLParagraphElement>(null)
  // const [keys, setKeys] = React.useState<string[]>([])
  // useEffect(() => {
  //   if (ref.current) {
  //     setKeys(Object.keys(ref.current))
  //   }
  // }, [])
  return (
    <>
      <p
      // ref={ref}
      >
        hello world {React.version}
      </p>
      {/* <p>keys of node: {keys.join(',')}</p> */}
    </>
  )
}
