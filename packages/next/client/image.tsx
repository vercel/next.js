import React from 'react'
import Head from '../next-server/lib/head'
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

export type ImageLoader = (resolverProps: ImageLoaderProps) => string

export type ImageLoaderProps = {
  src: string
  width: number
  quality?: number
}

type DefaultImageLoaderProps = ImageLoaderProps & { root: string }

const loaders = new Map<
  LoaderValue,
  (props: DefaultImageLoaderProps) => string
>([
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

type PlaceholderValue = 'blur' | 'empty'

type ImgElementStyle = NonNullable<JSX.IntrinsicElements['img']['style']>

export type ImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'src' | 'srcSet' | 'ref' | 'width' | 'height' | 'loading' | 'style'
> & {
  src: string
  loader?: ImageLoader
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
  ) &
  (
    | {
        placeholder?: Exclude<PlaceholderValue, 'blur'>
        blurDataURL?: never
      }
    | { placeholder: 'blur'; blurDataURL: string }
  )

const {
  deviceSizes: configDeviceSizes,
  imageSizes: configImageSizes,
  loader: configLoader,
  path: configPath,
  domains: configDomains,
  enableBlurryPlaceholder: configEnableBlurryPlaceholder,
} =
  ((process.env.__NEXT_IMAGE_OPTS as any) as ImageConfig) || imageConfigDefault
// sort smallest to largest
const allSizes = [...configDeviceSizes, ...configImageSizes]
configDeviceSizes.sort((a, b) => a - b)
allSizes.sort((a, b) => a - b)

function getWidths(
  width: number | undefined,
  layout: LayoutValue,
  sizes: string | undefined
): { widths: number[]; kind: 'w' | 'x' } {
  if (sizes && (layout === 'fill' || layout === 'responsive')) {
    // Find all the "vw" percent sizes used in the sizes prop
    const viewportWidthRe = /(^|\s)(1?\d?\d)vw/g
    const percentSizes = []
    for (let match; (match = viewportWidthRe.exec(sizes)); match) {
      percentSizes.push(parseInt(match[2]))
    }
    if (percentSizes.length) {
      const smallestRatio = Math.min(...percentSizes) * 0.01
      return {
        widths: allSizes.filter(
          (s) => s >= configDeviceSizes[0] * smallestRatio
        ),
        kind: 'w',
      }
    }
    return { widths: allSizes, kind: 'w' }
  }
  if (
    typeof width !== 'number' ||
    layout === 'fill' ||
    layout === 'responsive'
  ) {
    return { widths: configDeviceSizes, kind: 'w' }
  }

  const widths = [
    ...new Set(
      // > This means that most OLED screens that say they are 3x resolution,
      // > are actually 3x in the green color, but only 1.5x in the red and
      // > blue colors. Showing a 3x resolution image in the app vs a 2x
      // > resolution image will be visually the same, though the 3x image
      // > takes significantly more data. Even true 3x resolution screens are
      // > wasteful as the human eye cannot see that level of detail without
      // > something like a magnifying glass.
      // https://blog.twitter.com/engineering/en_us/topics/infrastructure/2019/capping-image-fidelity-on-ultra-high-resolution-devices.html
      [width, width * 2 /*, width * 3*/].map(
        (w) => allSizes.find((p) => p >= w) || allSizes[allSizes.length - 1]
      )
    ),
  ]
  return { widths, kind: 'x' }
}

type GenImgAttrsData = {
  src: string
  unoptimized: boolean
  layout: LayoutValue
  loader: ImageLoader
  width?: number
  quality?: number
  sizes?: string
}

type GenImgAttrsResult = {
  src: string
  srcSet: string | undefined
  sizes: string | undefined
}

function generateImgAttrs({
  src,
  unoptimized,
  layout,
  width,
  quality,
  sizes,
  loader,
}: GenImgAttrsData): GenImgAttrsResult {
  if (unoptimized) {
    return { src, srcSet: undefined, sizes: undefined }
  }

  const { widths, kind } = getWidths(width, layout, sizes)
  const last = widths.length - 1

  return {
    sizes: !sizes && kind === 'w' ? '100vw' : sizes,
    srcSet: widths
      .map(
        (w, i) =>
          `${loader({ src, quality, width: w })} ${
            kind === 'w' ? w : i + 1
          }${kind}`
      )
      .join(', '),

    // It's intended to keep `src` the last attribute because React updates
    // attributes in order. If we keep `src` the first one, Safari will
    // immediately start to fetch `src`, before `sizes` and `srcSet` are even
    // updated by React. That causes multiple unnecessary requests if `srcSet`
    // and `sizes` are defined.
    // This bug cannot be reproduced in Chrome or Firefox.
    src: loader({ src, quality, width: widths[last] }),
  }
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

function defaultImageLoader(loaderProps: ImageLoaderProps) {
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

// See https://stackoverflow.com/q/39777833/266535 for why we use this ref
// handler instead of the img's onLoad attribute.
function removePlaceholder(
  element: HTMLImageElement | null,
  placeholder: PlaceholderValue
) {
  if (placeholder === 'blur' && element) {
    if (element.complete) {
      // If the real image fails to load, this will still remove the placeholder.
      // This is the desired behavior for now, and will be revisited when error
      // handling is worked on for the image component itself.
      element.style.backgroundImage = 'none'
    } else {
      element.onload = () => {
        element.style.backgroundImage = 'none'
      }
    }
  }
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
  loader = defaultImageLoader,
  placeholder = 'empty',
  blurDataURL,
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

  if (!configEnableBlurryPlaceholder) {
    placeholder = 'empty'
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

  const MIN_IMG_SIZE_FOR_PLACEHOLDER = 5000
  const tooSmallForBlurryPlaceholder =
    widthInt && heightInt && widthInt * heightInt < MIN_IMG_SIZE_FOR_PLACEHOLDER
  const shouldShowBlurryPlaceholder =
    placeholder === 'blur' && !tooSmallForBlurryPlaceholder

  let wrapperStyle: JSX.IntrinsicElements['div']['style'] | undefined
  let sizerStyle: JSX.IntrinsicElements['div']['style'] | undefined
  let sizerSvg: string | undefined
  let imgStyle: ImgElementStyle | undefined = {
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

    ...(shouldShowBlurryPlaceholder
      ? {
          backgroundSize: 'cover',
          backgroundImage: `url("${blurDataURL}")`,
        }
      : undefined),
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
    srcSet: undefined,
    sizes: undefined,
  }

  if (isVisible) {
    imgAttributes = generateImgAttrs({
      src,
      unoptimized,
      layout,
      width: widthInt,
      quality: qualityInt,
      sizes,
      loader,
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
              style={{
                maxWidth: '100%',
                display: 'block',
                margin: 0,
                border: 'none',
                padding: 0,
              }}
              alt=""
              aria-hidden={true}
              role="presentation"
              src={`data:image/svg+xml;base64,${toBase64(sizerSvg)}`}
            />
          ) : null}
        </div>
      ) : null}
      {!isVisible && (
        <noscript>
          <img
            {...rest}
            {...generateImgAttrs({
              src,
              unoptimized,
              layout,
              width: widthInt,
              quality: qualityInt,
              sizes,
              loader,
            })}
            src={src}
            decoding="async"
            sizes={sizes}
            style={imgStyle}
            className={className}
          />
        </noscript>
      )}
      <img
        {...rest}
        {...imgAttributes}
        decoding="async"
        className={className}
        ref={(element) => {
          setRef(element)
          removePlaceholder(element, placeholder)
        }}
        style={imgStyle}
      />
      {priority ? (
        // Note how we omit the `href` attribute, as it would only be relevant
        // for browsers that do not support `imagesrcset`, and in those cases
        // it would likely cause the incorrect image to be preloaded.
        //
        // https://html.spec.whatwg.org/multipage/semantics.html#attr-link-imagesrcset
        <Head>
          <link
            key={
              '__nimg-' +
              imgAttributes.src +
              imgAttributes.srcSet +
              imgAttributes.sizes
            }
            rel="preload"
            as="image"
            href={imgAttributes.srcSet ? undefined : imgAttributes.src}
            // @ts-ignore: imagesrcset is not yet in the link element type
            imagesrcset={imgAttributes.srcSet}
            // @ts-ignore: imagesizes is not yet in the link element type
            imagesizes={imgAttributes.sizes}
          ></link>
        </Head>
      ) : null}
    </div>
  )
}

//BUILT IN LOADERS

function normalizeSrc(src: string): string {
  return src[0] === '/' ? src.slice(1) : src
}

function imgixLoader({
  root,
  src,
  width,
  quality,
}: DefaultImageLoaderProps): string {
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

function akamaiLoader({ root, src, width }: DefaultImageLoaderProps): string {
  return `${root}${normalizeSrc(src)}?imwidth=${width}`
}

function cloudinaryLoader({
  root,
  src,
  width,
  quality,
}: DefaultImageLoaderProps): string {
  // Demo: https://res.cloudinary.com/demo/image/upload/w_300,c_limit,q_auto/turtles.jpg
  const params = ['f_auto', 'c_limit', 'w_' + width, 'q_' + (quality || 'auto')]
  let paramsString = params.join(',') + '/'
  return `${root}${paramsString}${normalizeSrc(src)}`
}

function defaultLoader({
  root,
  src,
  width,
  quality,
}: DefaultImageLoaderProps): string {
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
            `See more info: https://nextjs.org/docs/messages/next-image-unconfigured-host`
        )
      }
    }
  }

  return `${root}?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`
}
