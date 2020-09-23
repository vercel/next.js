import React from 'react'

let imageData: any
if (typeof window === 'undefined') {
  // Rendering on a server, get image data from env
  imageData = JSON.parse(process.env.__NEXT_IMAGE_OPTS || '')
} else {
  // Rendering on a client, get image data from window
  imageData = JSON.parse((window as any).__NEXT_DATA__.images)
}

function computeSrc(src: string, host: string): string {
  if (!host) {
    // No host provided, use default
    return imageData.hosts.default.path + src
  } else {
    let selectedHost = imageData.hosts[host]
    if (!selectedHost) {
      console.error(
        `Image tag is used specifying host ${host}, but that host is not defined in next.config`
      )
      return src
    }
    return imageData.hosts[host].path + src
  }
}

function Image({
  src,
  host,
  ...rest
}: {
  src: string
  host: string
  rest: any[]
}) {
  return (
    <div>
      <img {...rest} src={computeSrc(src, host)} />
    </div>
  )
}

export default Image
