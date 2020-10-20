import React, { ReactElement, useEffect, useRef } from 'react'
import Head from '../next-server/lib/head'

const loaders: { [key: string]: (props: LoaderProps) => string } = {
  imgix: imgixLoader,
  cloudinary: cloudinaryLoader,
  default: defaultLoader,
}

type ImageData = {
  sizes?: number[]
  loader?: string
  path?: string
  autoOptimize?: boolean
}

type ImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'src' | 'srcSet' | 'ref'
> & {
  src: string
  width: number
  height: number
  quality?: string
  priority?: boolean
  lazy?: boolean
  unoptimized?: boolean
}

const imageData: ImageData = process.env.__NEXT_IMAGE_OPTS as any
const breakpoints = imageData.sizes || [640, 1024, 1600]
// Auto optimize defaults to on if not specified
if (imageData.autoOptimize === undefined) {
  imageData.autoOptimize = true
}

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
  let loader = loaders[imageData.loader || 'default']
  return loader({ root: imageData.path || '/_next/image', ...loaderProps })
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
  width,
  height,
  unoptimized = false,
  priority = false,
  lazy = false,
  className,
  quality,
  ...rest
}: ImageProps) {
  const thisEl = useRef<HTMLImageElement>(null)

  // Sanity Checks:
  // If priority and lazy are present, log an error and use priority only.
  if (priority && lazy) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        `Image with src ${src} has both priority and lazy tags. Only one should be used.`
      )
    }
    lazy = false
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
        widths: breakpoints,
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

  const ratio = (height / width) * 100
  const paddingBottom = `${isNaN(ratio) ? 1 : ratio}%`

  return (
    <div style={{ position: 'relative', paddingBottom }}>
      {shouldPreload
        ? generatePreload({
            src,
            widths: breakpoints,
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
        style={{
          height: '100%',
          left: '0',
          position: 'absolute',
          top: '0',
          width: '100%',
        }}
      />
    </div>
  )
}

//BUILT IN LOADERS

type LoaderProps = CallLoaderProps & { root: string }

function normalizeSrc(src: string) {
  return src[0] === '/' ? src.slice(1) : src
}

function imgixLoader({ root, src, width, quality }: LoaderProps): string {
  const params = []
  let paramsString = ''
  if (width) {
    params.push('w=' + width)
  }
  if (quality) {
    params.push('q=' + quality)
  }
  if (imageData.autoOptimize) {
    params.push('auto=compress')
  }
  if (params.length) {
    paramsString = '?' + params.join('&')
  }
  return `${root}${normalizeSrc(src)}${paramsString}`
}

function cloudinaryLoader({ root, src, width, quality }: LoaderProps): string {
  const params = []
  let paramsString = ''
  if (!quality && imageData.autoOptimize) {
    quality = 'auto'
  }
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
