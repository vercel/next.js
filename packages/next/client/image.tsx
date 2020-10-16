import React, { ReactElement } from 'react'
import Head from '../next-server/lib/head'

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
  breakpoints?: number[]
}

type ImageProps = {
  src: string
  host: string
  sizes: string
  breakpoints: number[]
  priority: boolean
  unoptimized: boolean
  rest: any[]
}

let imageData: any = process.env.__NEXT_IMAGE_OPTS
const breakpoints = imageData.breakpoints || [640, 1024, 1600]

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
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          `Image tag is used specifying host ${host}, but that host is not defined in next.config`
        )
      }
      return src
    }
    return callLoader(src, host)
  }
}

function callLoader(src: string, host: string, width?: number): string {
  let loader = loaders[imageData.hosts[host].loader || 'default']
  return loader({ root: imageData.hosts[host].path, src, width })
}

type SrcSetData = {
  src: string
  host: string
  widths: number[]
}

function generateSrcSet({ src, host, widths }: SrcSetData): string {
  // At each breakpoint, generate an image url using the loader, such as:
  // ' www.example.com/foo.jpg?w=480 480w, '
  return widths
    .map((width: number) => `${callLoader(src, host, width)} ${width}w`)
    .join(', ')
}

type PreloadData = {
  src: string
  host: string
  widths: number[]
  sizes: string
  unoptimized: boolean
}

function generatePreload({
  src,
  host,
  widths,
  unoptimized,
  sizes,
}: PreloadData): ReactElement {
  // This function generates an image preload that makes use of the "imagesrcset" and "imagesizes"
  // attributes for preloading responsive images. They're still experimental, but fully backward
  // compatible, as the link tag includes all necessary attributes, even if the final two are ignored.
  // See: https://web.dev/preload-responsive-images/
  return (
    <Head>
      <link
        rel="preload"
        as="image"
        href={computeSrc(src, host, unoptimized)}
        // @ts-ignore: imagesrcset and imagesizes not yet in the link element type
        imagesrcset={generateSrcSet({ src, host, widths })}
        imagesizes={sizes}
      />
    </Head>
  )
}

export default function Image({
  src,
  host,
  sizes,
  unoptimized,
  priority,
  ...rest
}: ImageProps) {
  // Sanity Checks:
  if (process.env.NODE_ENV !== 'production') {
    if (unoptimized && host) {
      console.error(`Image tag used specifying both a host and the unoptimized attribute--these are mutually exclusive. 
          With the unoptimized attribute, no host will be used, so specify an absolute URL.`)
    }
  }
  if (host && !imageData.hosts[host]) {
    // If unregistered host is selected, log an error and use the default instead
    if (process.env.NODE_ENV !== 'production') {
      console.error(`Image host identifier ${host} could not be resolved.`)
    }
    host = 'default'
  }

  host = host || 'default'

  // Normalize provided src
  if (src[0] === '/') {
    src = src.slice(1)
  }

  // Generate attribute values
  const imgSrc = computeSrc(src, host, unoptimized)
  const imgAttributes: { src: string; srcSet?: string } = { src: imgSrc }
  if (!unoptimized) {
    imgAttributes.srcSet = generateSrcSet({
      src,
      host: host,
      widths: breakpoints,
    })
  }
  // No need to add preloads on the client side--by the time the application is hydrated,
  // it's too late for preloads
  const shouldPreload = priority && typeof window === 'undefined'

  return (
    <div>
      {shouldPreload
        ? generatePreload({
            src,
            host,
            widths: breakpoints,
            unoptimized,
            sizes,
          })
        : ''}
      <img {...rest} {...imgAttributes} sizes={sizes} />
    </div>
  )
}

//BUILT IN LOADERS

type LoaderProps = {
  root: string
  src: string
  width?: number
}

function imgixLoader({ root, src, width }: LoaderProps): string {
  return `${root}${src}${width ? '?w=' + width : ''}`
}

function cloudinaryLoader({ root, src, width }: LoaderProps): string {
  return `${root}${width ? 'w_' + width + '/' : ''}${src}`
}

function defaultLoader({ root, src, width }: LoaderProps): string {
  // TODO: change quality parameter to be configurable
  return `${root}?url=${encodeURIComponent(src)}&width=${width}&q=100`
}
