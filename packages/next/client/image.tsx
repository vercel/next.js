import React from 'react'
export type ImageProps = {
  src: string
}
let imageData: any
if (typeof window === 'undefined') {
  // Rendering on a server, get image data from env
  imageData = JSON.parse(process.env.__NEXT_IMAGE_OPTS || '')
} else {
  // Rendering on a client, get image data from window
  imageData = JSON.parse((window as any).__NEXT_DATA__.images)
}

function computeSrc(props: ImageProps): string {
  return imageData.hosts?.default?.path + props.src
}

function Image(props: React.PropsWithChildren<ImageProps>) {
  return (
    <div>
      <img src={computeSrc(props)} />
    </div>
  )
}

export default Image
