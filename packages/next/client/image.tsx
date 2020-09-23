import React from 'react'

let imageData: any
if (typeof window === 'undefined') {
  // Rendering on a server, get image data from env
  imageData = JSON.parse(process.env.__NEXT_IMAGE_OPTS || '')
} else {
  // Rendering on a client, get image data from window
  imageData = JSON.parse((window as any).__NEXT_DATA__.images)
}

function computeSrc(src: string, host: string, unoptimized: boolean): string {
  if (unoptimized) {
    return src
  }
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
  unoptimized,
  ...rest
}: {
  src: string
  host: string
  unoptimized: boolean
  rest: any[]
}) {
  // Sanity Checks:
  if (unoptimized && host) {
    console.error(`Image tag used specifying both a host and the unoptimized attribute--these are mutually exclusive. 
        With the unoptimized attribute, no host will be used, so specify an absolute URL.`)
  }

  return (
    <div>
      <img {...rest} src={computeSrc(src, host, unoptimized)} />
    </div>
  )
}

export default Image
