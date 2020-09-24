import React from 'react'

const loaders: { [key: string]: (props: LoaderProps) => string } = {
  imgix: imgixLoader,
  cloudinary: cloudinaryLoader,
  default: defaultLoader,
}
type ImageData = {
  hosts: {
    [key: string]: {
      path: string
      loader: string
    }
  }
}
type ImageProps = {
  src: string
  host: string
  sizes: string
  breakpoints: any
  unoptimized: boolean
  rest: any[]
}

const bps = [480, 1024, 1600]
let imageData: ImageData
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
    return callLoader(src, 'default')
  } else {
    let selectedHost = imageData.hosts[host]
    if (!selectedHost) {
      console.error(
        `Image tag is used specifying host ${host}, but that host is not defined in next.config`
      )
      return src
    }
    return callLoader(src, host)
  }
}

function callLoader(src: string, host: string, width?: number): string {
  let loader = loaders[imageData.hosts[host].loader || 'default']
  // return JSON.stringify(imageData.hosts[host].loader || 'default')
  return loader({ root: imageData.hosts[host].path, filename: src, width })
  // return JSON.stringify(imageData.hosts[host].loader)
}

type SrcSetData = {
  src: string
  host: string
  breakpoints: number[]
}

function generateSrcSet({ src, host, breakpoints }: SrcSetData): string {
  // At each breakpoint, generate an image url using the loader, such as:
  // ' www.example.com/foo.jpg?w=480 480w, '
  return breakpoints
    .map(
      (breakpoint: number) =>
        `${callLoader(src, host, breakpoint)} ${breakpoint}w`
    )
    .join(', ')
}

function Image({ src, host, sizes, unoptimized, ...rest }: ImageProps) {
  // Sanity Checks:
  if (unoptimized && host) {
    console.error(`Image tag used specifying both a host and the unoptimized attribute--these are mutually exclusive. 
        With the unoptimized attribute, no host will be used, so specify an absolute URL.`)
  }
  // Generate attribute values
  const imgSrc = computeSrc(src, host || 'default', unoptimized)
  const imgAttributes: { src: string; srcSet?: string } = { src: imgSrc }
  if (!unoptimized) {
    imgAttributes.srcSet = generateSrcSet({
      src,
      host: host || 'default',
      breakpoints: bps,
    })
  }
  return (
    <div>
      <img {...rest} {...imgAttributes} sizes={sizes} />
    </div>
  )
}

//BUILT IN LOADERS

type LoaderProps = {
  root: string
  filename: string
  width?: number
}

function imgixLoader({ root, filename, width }: LoaderProps): string {
  return `${root}${filename}${width ? '?w=' + width : ''}`
}

function cloudinaryLoader({ root, filename, width }: LoaderProps): string {
  return `${root}${width ? 'w_' + width + '/' : ''}${filename}`
}

function defaultLoader({ root, filename }: LoaderProps): string {
  return `${root}${filename}`
}

export default Image
