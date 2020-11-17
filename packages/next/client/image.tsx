import React from 'react'
import { toBase64 } from '../next-server/lib/to-base-64'
import {
  ImageConfig,
  imageConfigDefault,
  LoaderValue,
  VALID_LOADERS,
} from '../next-server/server/image-config'
import { useIntersection } from './use-intersection'

if (typeof window === 'undefined') {
  ;(global as any).__NEXT_IMAGE_IMPORTED = true
}

const VALID_LOADING_VALUES = ['lazy', 'eager', undefined] as const
type LoadingValue = typeof VALID_LOADING_VALUES[number]

const loaders = new Map<LoaderValue, (props: LoaderProps) => string>([
  ['imgix', imgixLoader],
  ['cloudinary', cloudinaryLoader],
  ['akamai', akamaiLoader],
  ['default', defaultLoader],
])

const VALID_LAYOUT_VALUES = [
  'fill',
  'fixed',
  'intrinsic',
  'responsive',
  undefined,
] as const
type LayoutValue = typeof VALID_LAYOUT_VALUES[number]

type ImgElementStyle = NonNullable<JSX.IntrinsicElements['img']['style']>

export type ImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'src' | 'srcSet' | 'ref' | 'width' | 'height' | 'loading' | 'style'
> & {
  src: string
  quality?: number | string
  priority?: boolean
  loading?: LoadingValue
  unoptimized?: boolean
  objectFit?: ImgElementStyle['objectFit']
  objectPosition?: ImgElementStyle['objectPosition']
} & (
    | {
        width?: never
        height?: never
        /** @deprecated Use `layout="fill"` instead */
        unsized: true
      }
    | { width?: never; height?: never; layout: 'fill' }
    | {
        width: number | string
        height: number | string
        layout?: Exclude<LayoutValue, 'fill'>
      }
  )

const {
  deviceSizes: configDeviceSizes,
  imageSizes: configImageSizes,
  loader: configLoader,
  path: configPath,
  domains: configDomains,
} =
  ((process.env.__NEXT_IMAGE_OPTS as any) as ImageConfig) || imageConfigDefault
// sort smallest to largest
const allSizes = [...configDeviceSizes, ...configImageSizes]
configDeviceSizes.sort((a, b) => a - b)
allSizes.sort((a, b) => a - b)

function getWidths(
  width: number | undefined,
  layout: LayoutValue
): { widths: number[]; kind: 'w' | 'x' } {
  if (
    typeof width !== 'number' ||
    layout === 'fill' ||
    layout === 'responsive'
  ) {
    return { widths: configDeviceSizes, kind: 'w' }
  }

  const widths = [
    ...new Set(
      [width, width * 2, width * 3].map(
        (w) => allSizes.find((p) => p >= w) || allSizes[allSizes.length - 1]
      )
    ),
  ]
  return { widths, kind: 'x' }
}

type CallLoaderProps = {
  src: string
  width: number
  quality?: number
}

function callLoader(loaderProps: CallLoaderProps) {
  const load = loaders.get(configLoader)
  if (load) {
    return load({ root: configPath, ...loaderProps })
  }
  throw new Error(
    `Unknown "loader" found in "next.config.js". Expected: ${VALID_LOADERS.join(
      ', '
    )}. Received: ${configLoader}`
  )
}

type GenImgAttrsData = {
  src: string
  unoptimized: boolean
  layout: LayoutValue
  width?: number
  quality?: number
  sizes?: string
}

type GenImgAttrsResult = Pick<
  JSX.IntrinsicElements['img'],
  'src' | 'sizes' | 'srcSet'
>

function generateImgAttrs({
  src,
  unoptimized,
  layout,
  width,
  quality,
  sizes,
}: GenImgAttrsData): GenImgAttrsResult {
  if (unoptimized) {
    return { src }
  }

  const { widths, kind } = getWidths(width, layout)
  const last = widths.length - 1

  const srcSet = widths
    .map(
      (w, i) =>
        `${callLoader({ src, quality, width: w })} ${
          kind === 'w' ? w : i + 1
        }${kind}`
    )
    .join(', ')

  if (!sizes && kind === 'w') {
    sizes = widths
      .map((w, i) => (i === last ? `${w}px` : `(max-width: ${w}px) ${w}px`))
      .join(', ')
  }

  src = callLoader({ src, quality, width: widths[last] })

  return { src, sizes, srcSet }
}

function getInt(x: unknown): number | undefined {
  if (typeof x === 'number') {
    return x
  }
  if (typeof x === 'string') {
    return parseInt(x, 10)
  }
  return undefined
}

export default function Image({
  src,
  sizes,
  unoptimized = false,
  priority = false,
  loading,
  className,
  quality,
  width,
  height,
  objectFit,
  objectPosition,
  ...all
}: ImageProps) {
  let rest: Partial<ImageProps> = all
  let layout: NonNullable<LayoutValue> = sizes ? 'responsive' : 'intrinsic'
  let unsized = false
  if ('unsized' in rest) {
    unsized = Boolean(rest.unsized)
    // Remove property so it's not spread into image:
    delete rest['unsized']
  } else if ('layout' in rest) {
    // Override default layout if the user specified one:
    if (rest.layout) layout = rest.layout

    // Remove property so it's not spread into image:
    delete rest['layout']
  }

  if (process.env.NODE_ENV !== 'production') {
    if (!src) {
      throw new Error(
        `Image is missing required "src" property. Make sure you pass "src" in props to the \`next/image\` component. Received: ${JSON.stringify(
          { width, height, quality }
        )}`
      )
    }
    if (!VALID_LAYOUT_VALUES.includes(layout)) {
      throw new Error(
        `Image with src "${src}" has invalid "layout" property. Provided "${layout}" should be one of ${VALID_LAYOUT_VALUES.map(
          String
        ).join(',')}.`
      )
    }
    if (!VALID_LOADING_VALUES.includes(loading)) {
      throw new Error(
        `Image with src "${src}" has invalid "loading" property. Provided "${loading}" should be one of ${VALID_LOADING_VALUES.map(
          String
        ).join(',')}.`
      )
    }
    if (priority && loading === 'lazy') {
      throw new Error(
        `Image with src "${src}" has both "priority" and "loading='lazy'" properties. Only one should be used.`
      )
    }
    if (unsized) {
      throw new Error(
        `Image with src "${src}" has deprecated "unsized" property, which was removed in favor of the "layout='fill'" property`
      )
    }
  }

  let isLazy =
    !priority && (loading === 'lazy' || typeof loading === 'undefined')
  if (src && src.startsWith('data:')) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
    unoptimized = true
    isLazy = false
  }

  const [setRef, isIntersected] = useIntersection<HTMLImageElement>({
    rootMargin: '200px',
    disabled: !isLazy,
  })
  const isVisible = !isLazy || isIntersected

  const widthInt = getInt(width)
  const heightInt = getInt(height)
  const qualityInt = getInt(quality)

  let wrapperStyle: JSX.IntrinsicElements['div']['style'] | undefined
  let sizerStyle: JSX.IntrinsicElements['div']['style'] | undefined
  let sizerSvg: string | undefined
  let imgStyle: ImgElementStyle | undefined = {
    visibility: isVisible ? 'visible' : 'hidden',

    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,

    boxSizing: 'border-box',
    padding: 0,
    border: 'none',
    margin: 'auto',

    display: 'block',
    width: 0,
    height: 0,
    minWidth: '100%',
    maxWidth: '100%',
    minHeight: '100%',
    maxHeight: '100%',

    objectFit,
    objectPosition,
  }
  if (
    typeof widthInt !== 'undefined' &&
    typeof heightInt !== 'undefined' &&
    layout !== 'fill'
  ) {
    // <Image src="i.png" width="100" height="100" />
    const quotient = heightInt / widthInt
    const paddingTop = isNaN(quotient) ? '100%' : `${quotient * 100}%`
    if (layout === 'responsive') {
      // <Image src="i.png" width="100" height="100" layout="responsive" />
      wrapperStyle = {
        display: 'block',
        overflow: 'hidden',
        position: 'relative',

        boxSizing: 'border-box',
        margin: 0,
      }
      sizerStyle = { display: 'block', boxSizing: 'border-box', paddingTop }
    } else if (layout === 'intrinsic') {
      // <Image src="i.png" width="100" height="100" layout="intrinsic" />
      wrapperStyle = {
        display: 'inline-block',
        maxWidth: '100%',
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
        margin: 0,
      }
      sizerStyle = {
        boxSizing: 'border-box',
        display: 'block',
        maxWidth: '100%',
      }
      sizerSvg = `<svg width="${widthInt}" height="${heightInt}" xmlns="http://www.w3.org/2000/svg" version="1.1"/>`
    } else if (layout === 'fixed') {
      // <Image src="i.png" width="100" height="100" layout="fixed" />
      wrapperStyle = {
        overflow: 'hidden',
        boxSizing: 'border-box',
        display: 'inline-block',
        position: 'relative',
        width: widthInt,
        height: heightInt,
      }
    }
  } else if (
    typeof widthInt === 'undefined' &&
    typeof heightInt === 'undefined' &&
    layout === 'fill'
  ) {
    // <Image src="i.png" layout="fill" />
    wrapperStyle = {
      display: 'block',
      overflow: 'hidden',

      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,

      boxSizing: 'border-box',
      margin: 0,
    }
  } else {
    // <Image src="i.png" />
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        `Image with src "${src}" must use "width" and "height" properties or "layout='fill'" property.`
      )
    }
  }

  let imgAttributes: GenImgAttrsResult = {
    src:
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  }

  if (isVisible) {
    imgAttributes = generateImgAttrs({
      src,
      unoptimized,
      layout,
      width: widthInt,
      quality: qualityInt,
      sizes,
    })
  }

  if (unsized) {
    wrapperStyle = undefined
    sizerStyle = undefined
    imgStyle = undefined
  }
  return (
    <div style={wrapperStyle}>
      {sizerStyle ? (
        <div style={sizerStyle}>
          {sizerSvg ? (
            <img
              style={{ maxWidth: '100%', display: 'block' }}
              alt=""
              aria-hidden={true}
              role="presentation"
              src={`data:image/svg+xml;base64,${toBase64(sizerSvg)}`}
            />
          ) : null}
        </div>
      ) : null}
      <img
        {...rest}
        {...imgAttributes}
        decoding="async"
        className={className}
        ref={setRef}
        style={imgStyle}
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
  // Demo: https://static.imgix.net/daisy.png?format=auto&fit=max&w=300
  const params = ['auto=format', 'fit=max', 'w=' + width]
  let paramsString = ''
  if (quality) {
    params.push('q=' + quality)
  }

  if (params.length) {
    paramsString = '?' + params.join('&')
  }
  return `${root}${normalizeSrc(src)}${paramsString}`
}

function akamaiLoader({ root, src, width }: LoaderProps): string {
  return `${root}${normalizeSrc(src)}?imwidth=${width}`
}

function cloudinaryLoader({ root, src, width, quality }: LoaderProps): string {
  // Demo: https://res.cloudinary.com/demo/image/upload/w_300,c_limit/turtles.jpg
  const params = ['f_auto', 'c_limit', 'w_' + width]
  let paramsString = ''
  if (quality) {
    params.push('q_' + quality)
  }
  if (params.length) {
    paramsString = params.join(',') + '/'
  }
  return `${root}${paramsString}${normalizeSrc(src)}`
}

function defaultLoader({ root, src, width, quality }: LoaderProps): string {
  if (process.env.NODE_ENV !== 'production') {
    const missingValues = []

    // these should always be provided but make sure they are
    if (!src) missingValues.push('src')
    if (!width) missingValues.push('width')

    if (missingValues.length > 0) {
      throw new Error(
        `Next Image Optimization requires ${missingValues.join(
          ', '
        )} to be provided. Make sure you pass them as props to the \`next/image\` component. Received: ${JSON.stringify(
          { src, width, quality }
        )}`
      )
    }

    if (src.startsWith('//')) {
      throw new Error(
        `Failed to parse src "${src}" on \`next/image\`, protocol-relative URL (//) must be changed to an absolute URL (http:// or https://)`
      )
    }

    if (!src.startsWith('/') && configDomains) {
      let parsedSrc: URL
      try {
        parsedSrc = new URL(src)
      } catch (err) {
        console.error(err)
        throw new Error(
          `Failed to parse src "${src}" on \`next/image\`, if using relative image it must start with a leading slash "/" or be an absolute URL (http:// or https://)`
        )
      }

      if (!configDomains.includes(parsedSrc.hostname)) {
        throw new Error(
          `Invalid src prop (${src}) on \`next/image\`, hostname "${parsedSrc.hostname}" is not configured under images in your \`next.config.js\`\n` +
            `See more info: https://err.sh/next.js/next-image-unconfigured-host`
        )
      }
    }
  }

  return `${root}?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`
}
