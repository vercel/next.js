import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>Blurry Placeholder</p>

      <Image
        priority
        id="blurry-placeholder-raw"
        src="/test.ico"
        width="400"
        height="400"
        placeholder="blur"
        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8P4nhDwAGuAKPn6cicwAAAABJRU5ErkJggg=="
      />

      <div id="spacer" style={{ height: '1000vh' }} />

      <Image
        id="blurry-placeholder-with-lazy"
        src="/test.bmp"
        width="400"
        height="400"
        placeholder="blur"
        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO0/8/wBwAE/wI85bEJ6gAAAABJRU5ErkJggg=="
      />
    </div>
  )
}
