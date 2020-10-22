import React, { ReactElement, useEffect, useRef } from 'react'
import Head from '../next-server/lib/head'

const loaders = new Map<LoaderKey, (props: LoaderProps) => string>([
  ['imgix', imgixLoader],
  ['cloudinary', cloudinaryLoader],
  ['akamai', akamaiLoader],
  ['default', defaultLoader],
])

type LoaderKey = 'imgix' | 'cloudinary' | 'akamai' | 'default'

type ImageData = {
  sizes: number[]
  loader: LoaderKey
  path: string
}

type ImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'src' | 'srcSet' | 'ref' | 'width' | 'height'
> & {
  src: string
  quality?: string
  priority?: boolean
  lazy?: boolean
  unoptimized?: boolean
} & (
    | { width: number; height: number; unsized?: false }
    | { width?: number; height?: number; unsized: true }
  )

const imageData: ImageData = process.env.__NEXT_IMAGE_OPTS as any
const { sizes: configSizes, loader: configLoader, path: configPath } = imageData

let cachedObserver: IntersectionObserver
const IntersectionObserver =
  typeof window !== 'undefined' ? window.IntersectionObserver : null

function getObserver(): IntersectionObserver | undefined {
  // Return shared instance of IntersectionObserver if already created
  if (cachedObserver) {
    return cachedObserver
  }

  // Only create shared IntersectionObserver if supported in browser
  if (!IntersectionObserver) {
    return undefined
  }

  return (cachedObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          let lazyImage = entry.target as HTMLImageElement
          if (lazyImage.dataset.src) {
            lazyImage.src = lazyImage.dataset.src
          }
          if (lazyImage.dataset.srcset) {
            lazyImage.srcset = lazyImage.dataset.srcset
          }
          lazyImage.classList.remove('__lazy')
          cachedObserver.unobserve(lazyImage)
        }
      })
    },
    { rootMargin: '200px' }
  ))
}

function computeSrc(
  src: string,
  unoptimized: boolean,
  quality?: string
): string {
  if (unoptimized) {
    return src
  }
  return callLoader({ src, quality })
}

type CallLoaderProps = {
  src: string
  width?: number
  quality?: string
}

function callLoader(loaderProps: CallLoaderProps) {
  let load = loaders.get(configLoader) || defaultLoader
  return load({ root: configPath, ...loaderProps })
}

type SrcSetData = {
  src: string
  widths: number[]
  quality?: string
}

function generateSrcSet({ src, widths, quality }: SrcSetData): string {
  // At each breakpoint, generate an image url using the loader, such as:
  // ' www.example.com/foo.jpg?w=480 480w, '
  return widths
    .map((width: number) => `${callLoader({ src, width, quality })} ${width}w`)
    .join(', ')
}

type PreloadData = {
  src: string
  widths: number[]
  sizes?: string
  unoptimized?: boolean
  quality?: string
}

function generatePreload({
  src,
  widths,
  unoptimized = false,
  sizes,
  quality,
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
        href={computeSrc(src, unoptimized, quality)}
        // @ts-ignore: imagesrcset and imagesizes not yet in the link element type
        imagesrcset={generateSrcSet({ src, widths, quality })}
        imagesizes={sizes}
      />
    </Head>
  )
}

export default function Image({
  src,
  sizes,
  unoptimized = false,
  priority = false,
  lazy,
  className,
  quality,
  width,
  height,
  unsized,
  ...rest
}: ImageProps) {
  const thisEl = useRef<HTMLImageElement>(null)

  // Sanity Checks:
  // If priority and lazy are present, log an error and use priority only.
  if (priority && lazy) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `Image with src "${src}" has both "priority" and "lazy" properties. Only one should be used.`
      )
    }
  }

  if (!priority && typeof lazy === 'undefined') {
    lazy = true
  }

  useEffect(() => {
    const target = thisEl.current

    if (target && lazy) {
      const observer = getObserver()

      if (observer) {
        observer.observe(target)

        return () => {
          observer.unobserve(target)
        }
      }
    }
  }, [thisEl, lazy])

  // Generate attribute values
  const imgSrc = computeSrc(src, unoptimized, quality)
  const imgSrcSet = !unoptimized
    ? generateSrcSet({
        src,
        widths: configSizes,
        quality,
      })
    : undefined

  let imgAttributes:
    | {
        src: string
        srcSet?: string
      }
    | {
        'data-src': string
        'data-srcset'?: string
      }
  if (!lazy) {
    imgAttributes = {
      src: imgSrc,
    }
    if (imgSrcSet) {
      imgAttributes.srcSet = imgSrcSet
    }
  } else {
    imgAttributes = {
      'data-src': imgSrc,
    }
    if (imgSrcSet) {
      imgAttributes['data-srcset'] = imgSrcSet
    }
    className = className ? className + ' __lazy' : '__lazy'
  }

  // No need to add preloads on the client side--by the time the application is hydrated,
  // it's too late for preloads
  const shouldPreload = priority && typeof window === 'undefined'

  let divStyle: React.CSSProperties | undefined
  let imgStyle: React.CSSProperties | undefined
  let wrapperStyle: React.CSSProperties | undefined
  if (typeof height === 'number' && typeof width === 'number' && !unsized) {
    // <Image src="i.png" width=100 height=100 />
    const quotient = height / width
    const ratio = isNaN(quotient) ? 1 : quotient * 100
    wrapperStyle = {
      maxWidth: '100%',
      width,
    }
    divStyle = {
      position: 'relative',
      paddingBottom: `${ratio}%`,
    }
    imgStyle = {
      height: '100%',
      left: '0',
      position: 'absolute',
      top: '0',
      width: '100%',
    }
  } else if (
    typeof height === 'undefined' &&
    typeof width === 'undefined' &&
    unsized
  ) {
    // <Image src="i.png" unsized />
    if (process.env.NODE_ENV !== 'production') {
      if (priority) {
        // <Image src="i.png" unsized priority />
        console.warn(
          `Image with src "${src}" has both "priority" and "unsized" properties. Only one should be used.`
        )
      }
    }
  } else {
    // <Image src="i.png" />
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `Image with src "${src}" must use "width" and "height" properties or "unsized" property.`
      )
    }
  }

  return (
    <div style={wrapperStyle}>
      <div style={divStyle}>
        {shouldPreload
          ? generatePreload({
              src,
              widths: configSizes,
              unoptimized,
              sizes,
            })
          : ''}
        <img
          {...rest}
          {...imgAttributes}
          className={className}
          sizes={sizes}
          ref={thisEl}
          style={imgStyle}
        />
      </div>
    </div>
  )
}

//BUILT IN LOADERS

type LoaderProps = CallLoaderProps & { root: string }

function normalizeSrc(src: string) {
  return src[0] === '/' ? src.slice(1) : src
}

function imgixLoader({ root, src, width, quality }: LoaderProps): string {
  const params = ['auto=format']
  let paramsString = ''
  if (width) {
    params.push('w=' + width)
  }
  if (quality) {
    params.push('q=' + quality)
  }

  if (params.length) {
    paramsString = '?' + params.join('&')
  }
  return `${root}${normalizeSrc(src)}${paramsString}`
}

function akamaiLoader({ root, src, width }: LoaderProps): string {
  return `${root}${normalizeSrc(src)}${width ? '?imwidth=' + width : ''}`
}

function cloudinaryLoader({ root, src, width, quality }: LoaderProps): string {
  const params = ['f_auto']
  let paramsString = ''
  if (width) {
    params.push('w_' + width)
  }
  if (quality) {
    params.push('q_' + quality)
  }
  if (params.length) {
    paramsString = params.join(',') + '/'
  }
  return `${root}${paramsString}${normalizeSrc(src)}`
}

function defaultLoader({ root, src, width, quality }: LoaderProps): string {
  return `${root}?url=${encodeURIComponent(src)}&${
    width ? `w=${width}&` : ''
  }q=${quality || '100'}`
}
