import React from 'react'
import Head from '../shared/lib/head'
import { toBase64 } from '../shared/lib/to-base-64'
import {
  ImageConfigComplete,
  imageConfigDefault,
  LoaderValue,
  VALID_LOADERS,
} from '../server/image-config'
import { useIntersection } from './use-intersection'

const loadedImageURLs = new Set<string>()
const allImgs = new Map<
  string,
  { src: string; priority: boolean; placeholder: string }
>()
let perfObserver: PerformanceObserver | undefined
const emptyDataURL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

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
  ['default', defaultLoader],
  ['imgix', imgixLoader],
  ['cloudinary', cloudinaryLoader],
  ['akamai', akamaiLoader],
  ['custom', customLoader],
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

type OnLoadingComplete = (result: {
  naturalWidth: number
  naturalHeight: number
}) => void

type ImgElementStyle = NonNullable<JSX.IntrinsicElements['img']['style']>

interface StaticRequire {
  default: StaticImageData
}

type StaticImport = StaticRequire | StaticImageData

function isStaticRequire(
  src: StaticRequire | StaticImageData
): src is StaticRequire {
  return (src as StaticRequire).default !== undefined
}

function isStaticImageData(
  src: StaticRequire | StaticImageData
): src is StaticImageData {
  return (src as StaticImageData).src !== undefined
}

function isStaticImport(src: string | StaticImport): src is StaticImport {
  return (
    typeof src === 'object' &&
    (isStaticRequire(src as StaticImport) ||
      isStaticImageData(src as StaticImport))
  )
}

export type ImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'src' | 'srcSet' | 'ref' | 'width' | 'height' | 'loading' | 'style'
> & {
  src: string | StaticImport
  width?: number | string
  height?: number | string
  layout?: LayoutValue
  loader?: ImageLoader
  quality?: number | string
  priority?: boolean
  loading?: LoadingValue
  lazyBoundary?: string
  placeholder?: PlaceholderValue
  blurDataURL?: string
  unoptimized?: boolean
  objectFit?: ImgElementStyle['objectFit']
  objectPosition?: ImgElementStyle['objectPosition']
  onLoadingComplete?: OnLoadingComplete
}

const {
  deviceSizes: configDeviceSizes,
  imageSizes: configImageSizes,
  loader: configLoader,
  path: configPath,
  domains: configDomains,
} = (process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete) ||
imageConfigDefault
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
function handleLoading(
  img: HTMLImageElement | null,
  src: string,
  layout: LayoutValue,
  placeholder: PlaceholderValue,
  onLoadingComplete?: OnLoadingComplete
) {
  if (!img) {
    return
  }
  const handleLoad = () => {
    if (img.src !== emptyDataURL) {
      const p = 'decode' in img ? img.decode() : Promise.resolve()
      p.catch(() => {}).then(() => {
        if (placeholder === 'blur') {
          img.style.filter = 'none'
          img.style.backgroundSize = 'none'
          img.style.backgroundImage = 'none'
        }
        loadedImageURLs.add(src)
        if (onLoadingComplete) {
          const { naturalWidth, naturalHeight } = img
          // Pass back read-only primitive values but not the
          // underlying DOM element because it could be misused.
          onLoadingComplete({ naturalWidth, naturalHeight })
        }
        if (process.env.NODE_ENV !== 'production') {
          if (img.parentElement?.parentElement) {
            const parent = getComputedStyle(img.parentElement.parentElement)
            if (layout === 'responsive' && parent.display === 'flex') {
              console.warn(
                `Image with src "${src}" may not render properly as a child of a flex container. Consider wrapping the image with a div to configure the width.`
              )
            } else if (
              layout === 'fill' &&
              parent.position !== 'relative' &&
              parent.position !== 'fixed'
            ) {
              console.warn(
                `Image with src "${src}" may not render properly with a parent using position:"${parent.position}". Consider changing the parent style to position:"relative" with a width and height.`
              )
            }
          }
        }
      })
    }
  }
  if (img.complete) {
    // If the real image fails to load, this will still remove the placeholder.
    // This is the desired behavior for now, and will be revisited when error
    // handling is worked on for the image component itself.
    handleLoad()
  } else {
    img.onload = handleLoad
  }
}

export default function Image({
  src,
  sizes,
  unoptimized = false,
  priority = false,
  loading,
  lazyBoundary = '200px',
  className,
  quality,
  width,
  height,
  objectFit,
  objectPosition,
  onLoadingComplete,
  loader = defaultImageLoader,
  placeholder = 'empty',
  blurDataURL,
  ...all
}: ImageProps) {
  let rest: Partial<ImageProps> = all
  let layout: NonNullable<LayoutValue> = sizes ? 'responsive' : 'intrinsic'
  if ('layout' in rest) {
    // Override default layout if the user specified one:
    if (rest.layout) layout = rest.layout

    // Remove property so it's not spread into image:
    delete rest['layout']
  }

  let staticSrc = ''
  if (isStaticImport(src)) {
    const staticImageData = isStaticRequire(src) ? src.default : src

    if (!staticImageData.src) {
      throw new Error(
        `An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(
          staticImageData
        )}`
      )
    }
    blurDataURL = blurDataURL || staticImageData.blurDataURL
    staticSrc = staticImageData.src
    if (!layout || layout !== 'fill') {
      height = height || staticImageData.height
      width = width || staticImageData.width
      if (!staticImageData.height || !staticImageData.width) {
        throw new Error(
          `An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(
            staticImageData
          )}`
        )
      }
    }
  }
  src = typeof src === 'string' ? src : staticSrc

  const widthInt = getInt(width)
  const heightInt = getInt(height)
  const qualityInt = getInt(quality)

  let isLazy =
    !priority && (loading === 'lazy' || typeof loading === 'undefined')
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
    unoptimized = true
    isLazy = false
  }
  if (typeof window !== 'undefined' && loadedImageURLs.has(src)) {
    isLazy = false
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
    if (
      (typeof widthInt !== 'undefined' && isNaN(widthInt)) ||
      (typeof heightInt !== 'undefined' && isNaN(heightInt))
    ) {
      throw new Error(
        `Image with src "${src}" has invalid "width" or "height" property. These should be numeric values.`
      )
    }
    if (layout === 'fill' && (width || height)) {
      console.warn(
        `Image with src "${src}" and "layout='fill'" has unused properties assigned. Please remove "width" and "height".`
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
    if (sizes && layout !== 'fill' && layout !== 'responsive') {
      console.warn(
        `Image with src "${src}" has "sizes" property but it will be ignored. Only use "sizes" with "layout='fill'" or "layout='responsive'".`
      )
    }
    if (placeholder === 'blur') {
      if (layout !== 'fill' && (widthInt || 0) * (heightInt || 0) < 1600) {
        console.warn(
          `Image with src "${src}" is smaller than 40x40. Consider removing the "placeholder='blur'" property to improve performance.`
        )
      }
      if (!blurDataURL) {
        const VALID_BLUR_EXT = ['jpeg', 'png', 'webp', 'avif'] // should match next-image-loader

        throw new Error(
          `Image with src "${src}" has "placeholder='blur'" property but is missing the "blurDataURL" property.
          Possible solutions:
            - Add a "blurDataURL" property, the contents should be a small Data URL to represent the image
            - Change the "src" property to a static import with one of the supported file types: ${VALID_BLUR_EXT.join(
              ','
            )}
            - Remove the "placeholder" property, effectively no blur effect
          Read more: https://nextjs.org/docs/messages/placeholder-blur-data-url`
        )
      }
    }
    if ('ref' in rest) {
      console.warn(
        `Image with src "${src}" is using unsupported "ref" property. Consider using the "onLoadingComplete" property instead.`
      )
    }
    if ('style' in rest) {
      console.warn(
        `Image with src "${src}" is using unsupported "style" property. Please use the "className" property instead.`
      )
    }

    if (!unoptimized) {
      const urlStr = loader({
        src,
        width: widthInt || 400,
        quality: qualityInt || 75,
      })
      let url: URL | undefined
      try {
        url = new URL(urlStr)
      } catch (err) {}
      if (urlStr === src || (url && url.pathname === src && !url.search)) {
        console.warn(
          `Image with src "${src}" has a "loader" property that does not implement width. Please implement it or use the "unoptimized" property instead.` +
            `\nRead more: https://nextjs.org/docs/messages/next-image-missing-loader-width`
        )
      }
    }

    if (
      typeof window !== 'undefined' &&
      !perfObserver &&
      window.PerformanceObserver
    ) {
      perfObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          // @ts-ignore - missing "LargestContentfulPaint" class with "element" prop
          const imgSrc = entry?.element?.src || ''
          const lcpImage = allImgs.get(imgSrc)
          if (
            lcpImage &&
            !lcpImage.priority &&
            lcpImage.placeholder !== 'blur' &&
            !lcpImage.src.startsWith('data:') &&
            !lcpImage.src.startsWith('blob:')
          ) {
            // https://web.dev/lcp/#measure-lcp-in-javascript
            console.warn(
              `Image with src "${lcpImage.src}" was detected as the Largest Contentful Paint (LCP). Please add the "priority" property if this image is above the fold.` +
                `\nRead more: https://nextjs.org/docs/api-reference/next/image#priority`
            )
          }
        }
      })
      perfObserver.observe({ type: 'largest-contentful-paint', buffered: true })
    }
  }

  const [setRef, isIntersected] = useIntersection<HTMLImageElement>({
    rootMargin: lazyBoundary,
    disabled: !isLazy,
  })
  const isVisible = !isLazy || isIntersected

  const wrapperStyle: JSX.IntrinsicElements['span']['style'] = {
    boxSizing: 'border-box',
    display: 'block',
    overflow: 'hidden',
    width: 'initial',
    height: 'initial',
    background: 'none',
    opacity: 1,
    border: 0,
    margin: 0,
    padding: 0,
  }
  const sizerStyle: JSX.IntrinsicElements['span']['style'] = {
    boxSizing: 'border-box',
    display: 'block',
    width: 'initial',
    height: 'initial',
    background: 'none',
    opacity: 1,
    border: 0,
    margin: 0,
    padding: 0,
  }
  let hasSizer = false
  let sizerSvg: string | undefined
  const imgStyle: ImgElementStyle = {
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
  const blurStyle =
    placeholder === 'blur'
      ? {
          filter: 'blur(20px)',
          backgroundSize: objectFit || 'cover',
          backgroundImage: `url("${blurDataURL}")`,
          backgroundPosition: objectPosition || '0% 0%',
        }
      : {}
  if (layout === 'fill') {
    // <Image src="i.png" layout="fill" />
    wrapperStyle.display = 'block'
    wrapperStyle.position = 'absolute'
    wrapperStyle.top = 0
    wrapperStyle.left = 0
    wrapperStyle.bottom = 0
    wrapperStyle.right = 0
  } else if (
    typeof widthInt !== 'undefined' &&
    typeof heightInt !== 'undefined'
  ) {
    // <Image src="i.png" width="100" height="100" />
    const quotient = heightInt / widthInt
    const paddingTop = isNaN(quotient) ? '100%' : `${quotient * 100}%`
    if (layout === 'responsive') {
      // <Image src="i.png" width="100" height="100" layout="responsive" />
      wrapperStyle.display = 'block'
      wrapperStyle.position = 'relative'
      hasSizer = true
      sizerStyle.paddingTop = paddingTop
    } else if (layout === 'intrinsic') {
      // <Image src="i.png" width="100" height="100" layout="intrinsic" />
      wrapperStyle.display = 'inline-block'
      wrapperStyle.position = 'relative'
      wrapperStyle.maxWidth = '100%'
      hasSizer = true
      sizerStyle.maxWidth = '100%'
      sizerSvg = `<svg width="${widthInt}" height="${heightInt}" xmlns="http://www.w3.org/2000/svg" version="1.1"/>`
    } else if (layout === 'fixed') {
      // <Image src="i.png" width="100" height="100" layout="fixed" />
      wrapperStyle.display = 'inline-block'
      wrapperStyle.position = 'relative'
      wrapperStyle.width = widthInt
      wrapperStyle.height = heightInt
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
    src: emptyDataURL,
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

  let srcString: string = src

  if (process.env.NODE_ENV !== 'production') {
    if (typeof window !== 'undefined') {
      let fullUrl: URL
      try {
        fullUrl = new URL(imgAttributes.src)
      } catch (e) {
        fullUrl = new URL(imgAttributes.src, window.location.href)
      }
      allImgs.set(fullUrl.href, { src, priority, placeholder })
    }
  }

  return (
    <span style={wrapperStyle}>
      {hasSizer ? (
        <span style={sizerStyle}>
          {sizerSvg ? (
            <img
              style={{
                display: 'block',
                maxWidth: '100%',
                width: 'initial',
                height: 'initial',
                background: 'none',
                opacity: 1,
                border: 0,
                margin: 0,
                padding: 0,
              }}
              alt=""
              aria-hidden={true}
              src={`data:image/svg+xml;base64,${toBase64(sizerSvg)}`}
            />
          ) : null}
        </span>
      ) : null}
      <img
        {...rest}
        {...imgAttributes}
        decoding="async"
        data-nimg={layout}
        className={className}
        ref={(img) => {
          setRef(img)
          handleLoading(img, srcString, layout, placeholder, onLoadingComplete)
        }}
        style={{ ...imgStyle, ...blurStyle }}
      />
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
          decoding="async"
          data-nimg={layout}
          style={imgStyle}
          className={className}
          // @ts-ignore - TODO: upgrade to `@types/react@17`
          loading={loading || 'lazy'}
        />
      </noscript>

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
            // @ts-ignore: imagesrcset is not yet in the link element type.
            imagesrcset={imgAttributes.srcSet}
            // @ts-ignore: imagesizes is not yet in the link element type.
            imagesizes={imgAttributes.sizes}
          ></link>
        </Head>
      ) : null}
    </span>
  )
}

function normalizeSrc(src: string): string {
  return src[0] === '/' ? src.slice(1) : src
}

function imgixLoader({
  root,
  src,
  width,
  quality,
}: DefaultImageLoaderProps): string {
  // Demo: https://static.imgix.net/daisy.png?auto=format&fit=max&w=300
  const url = new URL(`${root}${normalizeSrc(src)}`)
  const params = url.searchParams

  params.set('auto', params.get('auto') || 'format')
  params.set('fit', params.get('fit') || 'max')
  params.set('w', params.get('w') || width.toString())

  if (quality) {
    params.set('q', quality.toString())
  }

  return url.href
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
  const paramsString = params.join(',') + '/'
  return `${root}${paramsString}${normalizeSrc(src)}`
}

function customLoader({ src }: DefaultImageLoaderProps): string {
  throw new Error(
    `Image with src "${src}" is missing "loader" prop.` +
      `\nRead more: https://nextjs.org/docs/messages/next-image-missing-loader`
  )
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

      if (
        process.env.NODE_ENV !== 'test' &&
        !configDomains.includes(parsedSrc.hostname)
      ) {
        throw new Error(
          `Invalid src prop (${src}) on \`next/image\`, hostname "${parsedSrc.hostname}" is not configured under images in your \`next.config.js\`\n` +
            `See more info: https://nextjs.org/docs/messages/next-image-unconfigured-host`
        )
      }
    }
  }

  return `${root}?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`
}
