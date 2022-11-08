import React, { useEffect, useState } from 'react'
import Image from 'next/image'

const Page = () => {
  const [src, setSrc] = useState()

  useEffect(() => {
    fetch('/test.jpg')
      .then((res) => {
        return res.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        setSrc(url)
      })
  }, [])

  return (
    <div>
      <p>Blob URL</p>
      {src ? <Image id="blob-image" src={src} width="10" height="10" /> : null}
    </div>
  )
}

export default Page
