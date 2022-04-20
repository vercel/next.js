import React, {
  useRef,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import Head from '../shared/lib/head'
import {
  ImageConfigComplete,
  imageConfigDefault,
  LoaderValue,
  VALID_LOADERS,
} from '../shared/lib/image-config'
import { useIntersection } from './use-intersection'
import { ImageConfigContext } from '../shared/lib/image-config-context'
import { warnOnce } from '../shared/lib/utils'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'

const experimentalLayoutRaw = (process.env.__NEXT_IMAGE_OPTS as any)
  ?.experimentalLayoutRaw
const configEnv = process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete
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
type ImageConfig = ImageConfigComplete & { allSizes: number[] }
export type ImageLoader = (resolverProps: ImageLoaderProps) => string

export type ImageLoaderProps = {
  src: string
  width: number
  quality?: number
}

// Do not export - this is an internal type only
// because `next.config.js` is only meant for the
// built-in loaders, not for a custom loader() prop.
type ImageLoaderWithConfig = (
  resolverProps: ImageLoaderPropsWithConfig
) => string
type ImageLoaderPropsWithConfig = ImageLoaderProps & {
  config: Readonly<ImageConfig>
}

const loaders = new Map<
  LoaderValue,
  (props: ImageLoaderPropsWithConfig) => string
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
  'raw',
  undefined,
] as const
type LayoutValue = typeof VALID_LAYOUT_VALUES[number]

type PlaceholderValue = 'blur' | 'empty'

type OnLoadingComplete = (result: {
  naturalWidth: number
  naturalHeight: number
}) => void

type ImgElementStyle = NonNullable<JSX.IntrinsicElements['img']['style']>

type ImgElementWithDataProp = HTMLImageElement & {
  'data-loaded-src': string | undefined
}

export interface StaticImageData {
  src: string
  height: number
  width: number
  blurDataURL?: string
}

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
  'src' | 'srcSet' | 'ref' | 'width' | 'height' | 'loading'
> & {
  src: string | StaticImport
  width?: number | string
  height?: number | string
  layout?: LayoutValue
  loader?: ImageLoader
  quality?: number | string
  priority?: boolean
  loading?: LoadingValue
  lazyRoot?: React.RefObject<HTMLElement> | null
  lazyBoundary?: string
  placeholder?: PlaceholderValue
  blurDataURL?: string
  unoptimized?: boolean
  objectFit?: ImgElementStyle['objectFit']
  objectPosition?: ImgElementStyle['objectPosition']
  onLoadingComplete?: OnLoadingComplete
}

type ImageElementProps = Omit<ImageProps, 'src' | 'loader'> & {
  srcString: string
  imgAttributes: GenImgAttrsResult
  heightInt: number | undefined
  widthInt: number | undefined
  qualityInt: number | undefined
  layout: LayoutValue
  imgStyle: ImgElementStyle
  blurStyle: ImgElementStyle
  isLazy: boolean
  loading: LoadingValue
  config: ImageConfig
  unoptimized: boolean
  loader: ImageLoaderWithConfig
  placeholder: PlaceholderValue
  onLoadingCompleteRef: React.MutableRefObject<OnLoadingComplete | undefined>
  setBlurComplete: (b: boolean) => void
  setIntersection: (img: HTMLImageElement | null) => void
  isVisible: boolean
}

function getWidths(
  { deviceSizes, allSizes }: ImageConfig,
  width: number | undefined,
  layout: LayoutValue,
  sizes: string | undefined
): { widths: number[]; kind: 'w' | 'x' } {
  if (
    sizes &&
    (layout === 'fill' || layout === 'responsive' || layout === 'raw')
  ) {
    // Find all the "vw" percent sizes used in the sizes prop
    const viewportWidthRe = /(^|\s)(1?\d?\d)vw/g
    const percentSizes = []
    for (let match; (match = viewportWidthRe.exec(sizes)); match) {
      percentSizes.push(parseInt(match[2]))
    }
    if (percentSizes.length) {
      const smallestRatio = Math.min(...percentSizes) * 0.01
      return {
        widths: allSizes.filter((s) => s >= deviceSizes[0] * smallestRatio),
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
    return { widths: deviceSizes, kind: 'w' }
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
  config: ImageConfig
  src: string
  unoptimized: boolean
  layout: LayoutValue
  loader: ImageLoaderWithConfig
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
  config,
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

  const { widths, kind } = getWidths(config, width, layout, sizes)
  const last = widths.length - 1

  return {
    sizes: !sizes && kind === 'w' ? '100vw' : sizes,
    srcSet: widths
      .map(
        (w, i) =>
          `${loader({ config, src, quality, width: w })} ${
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
    src: loader({ config, src, quality, width: widths[last] }),
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

function defaultImageLoader(loaderProps: ImageLoaderPropsWithConfig) {
  const loaderKey = loaderProps.config?.loader || 'default'
  const load = loaders.get(loaderKey)
  if (load) {
    return load(loaderProps)
  }
  throw new Error(
    `Unknown "loader" found in "next.config.js". Expected: ${VALID_LOADERS.join(
      ', '
    )}. Received: ${loaderKey}`
  )
}

// See https://stackoverflow.com/q/39777833/266535 for why we use this ref
// handler instead of the img's onLoad attribute.
function handleLoading(
  img: ImgElementWithDataProp,
  src: string,
  layout: LayoutValue,
  placeholder: PlaceholderValue,
  onLoadingCompleteRef: React.MutableRefObject<OnLoadingComplete | undefined>,
  setBlurComplete: (b: boolean) => void
) {
  if (!img || img.src === emptyDataURL || img['data-loaded-src'] === src) {
    return
  }
  img['data-loaded-src'] = src
  const p = 'decode' in img ? img.decode() : Promise.resolve()
  p.catch(() => {}).then(() => {
    if (!img.parentNode) {
      // Exit early in case of race condition:
      // - onload() is called
      // - decode() is called but incomplete
      // - unmount is called
      // - decode() completes
      return
    }
    loadedImageURLs.add(src)
    if (placeholder === 'blur') {
      setBlurComplete(true)
    }
    if (onLoadingCompleteRef?.current) {
      const { naturalWidth, naturalHeight } = img
      // Pass back read-only primitive values but not the
      // underlying DOM element because it could be misused.
      onLoadingCompleteRef.current({ naturalWidth, naturalHeight })
    }
    if (process.env.NODE_ENV !== 'production') {
      if (img.parentElement?.parentElement) {
        const parent = getComputedStyle(img.parentElement.parentElement)
        if (!parent.position) {
          // The parent has not been rendered to the dom yet and therefore it has no position. Skip the warnings for such cases.
        } else if (layout === 'responsive' && parent.display === 'flex') {
          warnOnce(
            `Image with src "${src}" may not render properly as a child of a flex container. Consider wrapping the image with a div to configure the width.`
          )
        } else if (
          layout === 'fill' &&
          parent.position !== 'relative' &&
          parent.position !== 'fixed' &&
          parent.position !== 'absolute'
        ) {
          warnOnce(
            `Image with src "${src}" may not render properly with a parent using position:"${parent.position}". Consider changing the parent style to position:"relative" with a width and height.`
          )
        }
      }
    }
  })
}

export default function Image({
  src,
  sizes,
  unoptimized = false,
  priority = false,
  loading,
  lazyRoot = null,
  lazyBoundary = '200px',
  className,
  quality,
  width,
  height,
  style,
  objectFit,
  objectPosition,
  onLoadingComplete,
  onError,
  placeholder = 'empty',
  blurDataURL,
  ...all
}: ImageProps) {
  const configContext = useContext(ImageConfigContext)
  const config: ImageConfig = useMemo(() => {
    const c = configEnv || configContext || imageConfigDefault
    const allSizes = [...c.deviceSizes, ...c.imageSizes].sort((a, b) => a - b)
    const deviceSizes = c.deviceSizes.sort((a, b) => a - b)
    return { ...c, allSizes, deviceSizes }
  }, [configContext])

  let rest: Partial<ImageProps> = all
  let layout: NonNullable<LayoutValue> = sizes ? 'responsive' : 'intrinsic'
  if ('layout' in rest) {
    // Override default layout if the user specified one:
    if (rest.layout) layout = rest.layout

    // Remove property so it's not spread on <img>:
    delete rest.layout
  }

  let loader: ImageLoaderWithConfig = defaultImageLoader
  if ('loader' in rest) {
    if (rest.loader) {
      const customImageLoader = rest.loader
      loader = (obj) => {
        const { config: _, ...opts } = obj
        // The config object is internal only so we must
        // not pass it to the user-defined loader()
        return customImageLoader(opts)
      }
    }
    // Remove property so it's not spread on <img>
    delete rest.loader
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

  const [blurComplete, setBlurComplete] = useState(false)
  const [setIntersection, isIntersected, resetIntersected] =
    useIntersection<HTMLImageElement>({
      rootRef: lazyRoot,
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
  let sizerSvgUrl: string | undefined
  const layoutStyle: ImgElementStyle = {
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

  if (process.env.NODE_ENV !== 'production' && layout !== 'raw' && style) {
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
    if (layout === 'raw' && !experimentalLayoutRaw) {
      throw new Error(
        `The "raw" layout is currently experimental and may be subject to breaking changes. To use layout="raw", include \`experimental: { images: { layoutRaw: true } }\` in your next.config.js file.`
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
      warnOnce(
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
    if (layout === 'raw' && (objectFit || objectPosition)) {
      throw new Error(
        `Image with src "${src}" has "layout='raw'" and 'objectFit' or 'objectPosition'. For raw images, these and other styles should be specified using the 'style' attribute.`
      )
    }
    if (
      sizes &&
      layout !== 'fill' &&
      layout !== 'responsive' &&
      layout !== 'raw'
    ) {
      warnOnce(
        `Image with src "${src}" has "sizes" property but it will be ignored. Only use "sizes" with "layout='fill'", "layout='responsive'", or "layout='raw'`
      )
    }
    if (placeholder === 'blur') {
      if (layout !== 'fill' && (widthInt || 0) * (heightInt || 0) < 1600) {
        warnOnce(
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
      warnOnce(
        `Image with src "${src}" is using unsupported "ref" property. Consider using the "onLoadingComplete" property instead.`
      )
    }

    if (!unoptimized && loader !== defaultImageLoader) {
      const urlStr = loader({
        config,
        src,
        width: widthInt || 400,
        quality: qualityInt || 75,
      })
      let url: URL | undefined
      try {
        url = new URL(urlStr)
      } catch (err) {}
      if (urlStr === src || (url && url.pathname === src && !url.search)) {
        warnOnce(
          `Image with src "${src}" has a "loader" property that does not implement width. Please implement it or use the "unoptimized" property instead.` +
            `\nRead more: https://nextjs.org/docs/messages/next-image-missing-loader-width`
        )
      }
    }

    if (style && layout !== 'raw') {
      let overwrittenStyles = Object.keys(style).filter(
        (key) => key in layoutStyle
      )
      if (overwrittenStyles.length) {
        warnOnce(
          `Image with src ${src} is assigned the following styles, which are overwritten by automatically-generated styles: ${overwrittenStyles.join(
            ', '
          )}`
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
            warnOnce(
              `Image with src "${lcpImage.src}" was detected as the Largest Contentful Paint (LCP). Please add the "priority" property if this image is above the fold.` +
                `\nRead more: https://nextjs.org/docs/api-reference/next/image#priority`
            )
          }
        }
      })
      try {
        perfObserver.observe({
          type: 'largest-contentful-paint',
          buffered: true,
        })
      } catch (err) {
        // Log error but don't crash the app
        console.error(err)
      }
    }
  }

  const imgStyle = Object.assign(
    {},
    style,
    layout === 'raw'
      ? { aspectRatio: `${widthInt} / ${heightInt}` }
      : layoutStyle
  )
  const blurStyle =
    placeholder === 'blur' && !blurComplete
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
      sizerSvgUrl = `data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%27${widthInt}%27%20height=%27${heightInt}%27/%3e`
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
      config,
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

  let imageSrcSetPropName = 'imagesrcset'
  let imageSizesPropName = 'imagesizes'
  if (process.env.__NEXT_REACT_ROOT) {
    imageSrcSetPropName = 'imageSrcSet'
    imageSizesPropName = 'imageSizes'
  }
  const linkProps = {
    // Note: imagesrcset and imagesizes are not in the link element type with react 17.
    [imageSrcSetPropName]: imgAttributes.srcSet,
    [imageSizesPropName]: imgAttributes.sizes,
  }

  const useLayoutEffect =
    typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect
  const onLoadingCompleteRef = useRef(onLoadingComplete)

  const previousImageSrc = useRef<string | StaticImport>(src)
  useEffect(() => {
    onLoadingCompleteRef.current = onLoadingComplete
  }, [onLoadingComplete])

  useLayoutEffect(() => {
    if (previousImageSrc.current !== src) {
      resetIntersected()
      previousImageSrc.current = src
    }
  }, [resetIntersected, src])

  const imgElementArgs = {
    isLazy,
    imgAttributes,
    heightInt,
    widthInt,
    qualityInt,
    layout,
    className,
    imgStyle,
    blurStyle,
    loading,
    config,
    unoptimized,
    placeholder,
    loader,
    srcString,
    onLoadingCompleteRef,
    setBlurComplete,
    setIntersection,
    isVisible,
    ...rest,
  }
  return (
    <>
      {layout === 'raw' ? (
        <ImageElement {...imgElementArgs} />
      ) : (
        <span style={wrapperStyle}>
          {hasSizer ? (
            <span style={sizerStyle}>
              {sizerSvgUrl ? (
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
                  src={sizerSvgUrl}
                />
              ) : null}
            </span>
          ) : null}
          <ImageElement {...imgElementArgs} />
        </span>
      )}
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
            {...linkProps}
          />
        </Head>
      ) : null}
    </>
  )
}

const ImageElement = ({
  imgAttributes,
  heightInt,
  widthInt,
  qualityInt,
  layout,
  className,
  imgStyle,
  blurStyle,
  isLazy,
  placeholder,
  loading,
  srcString,
  config,
  unoptimized,
  loader,
  onLoadingCompleteRef,
  setBlurComplete,
  setIntersection,
  onLoad,
  onError,
  isVisible,
  ...rest
}: ImageElementProps) => {
  return (
    <>
      <img
        {...rest}
        {...imgAttributes}
        {...(layout === 'raw' && !imgAttributes.sizes
          ? { height: heightInt, width: widthInt }
          : {})}
        decoding="async"
        data-nimg={layout}
        className={className}
        style={{ ...imgStyle, ...blurStyle }}
        ref={useCallback(
          (img: ImgElementWithDataProp) => {
            setIntersection(img)
            if (img?.complete) {
              handleLoading(
                img,
                srcString,
                layout,
                placeholder,
                onLoadingCompleteRef,
                setBlurComplete
              )
            }
          },
          [
            setIntersection,
            srcString,
            layout,
            placeholder,
            onLoadingCompleteRef,
            setBlurComplete,
          ]
        )}
        onLoad={(event) => {
          const img = event.currentTarget as ImgElementWithDataProp
          handleLoading(
            img,
            srcString,
            layout,
            placeholder,
            onLoadingCompleteRef,
            setBlurComplete
          )
          if (onLoad) {
            onLoad(event)
          }
        }}
        onError={(event) => {
          if (placeholder === 'blur') {
            // If the real image fails to load, this will still remove the placeholder.
            setBlurComplete(true)
          }
          if (onError) {
            onError(event)
          }
        }}
      />
      {(isLazy || placeholder === 'blur') && (
        <noscript>
          <img
            {...rest}
            {...generateImgAttrs({
              config,
              src: srcString,
              unoptimized,
              layout,
              width: widthInt,
              quality: qualityInt,
              sizes: imgAttributes.sizes,
              loader,
            })}
            {...(layout === 'raw' && !imgAttributes.sizes
              ? { height: heightInt, width: widthInt }
              : {})}
            decoding="async"
            data-nimg={layout}
            style={imgStyle}
            className={className}
            // @ts-ignore - TODO: upgrade to `@types/react@17`
            loading={loading || 'lazy'}
          />
        </noscript>
      )}
    </>
  )
}

function normalizeSrc(src: string): string {
  return src[0] === '/' ? src.slice(1) : src
}

function imgixLoader({
  config,
  src,
  width,
  quality,
}: ImageLoaderPropsWithConfig): string {
  // Demo: https://static.imgix.net/daisy.png?auto=format&fit=max&w=300
  const url = new URL(`${config.path}${normalizeSrc(src)}`)
  const params = url.searchParams

  params.set('auto', params.get('auto') || 'format')
  params.set('fit', params.get('fit') || 'max')
  params.set('w', params.get('w') || width.toString())

  if (quality) {
    params.set('q', quality.toString())
  }

  return url.href
}

function akamaiLoader({
  config,
  src,
  width,
}: ImageLoaderPropsWithConfig): string {
  return `${config.path}${normalizeSrc(src)}?imwidth=${width}`
}

function cloudinaryLoader({
  config,
  src,
  width,
  quality,
}: ImageLoaderPropsWithConfig): string {
  // Demo: https://res.cloudinary.com/demo/image/upload/w_300,c_limit,q_auto/turtles.jpg
  const params = ['f_auto', 'c_limit', 'w_' + width, 'q_' + (quality || 'auto')]
  const paramsString = params.join(',') + '/'
  return `${config.path}${paramsString}${normalizeSrc(src)}`
}

function customLoader({ src }: ImageLoaderProps): string {
  throw new Error(
    `Image with src "${src}" is missing "loader" prop.` +
      `\nRead more: https://nextjs.org/docs/messages/next-image-missing-loader`
  )
}

function defaultLoader({
  config,
  src,
  width,
  quality,
}: ImageLoaderPropsWithConfig): string {
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

    if (!src.startsWith('/') && config.domains) {
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
        !config.domains.includes(parsedSrc.hostname)
      ) {
        throw new Error(
          `Invalid src prop (${src}) on \`next/image\`, hostname "${parsedSrc.hostname}" is not configured under images in your \`next.config.js\`\n` +
            `See more info: https://nextjs.org/docs/messages/next-image-unconfigured-host`
        )
      }
    }
  }

  if (src.endsWith('.svg') && !config.dangerouslyAllowSVG) {
    // Special case to make svg serve as-is to avoid proxying
    // through the built-in Image Optimization API.
    return src
  }

  return `${normalizePathTrailingSlash(config.path)}?url=${encodeURIComponent(
    src
  )}&w=${width}&q=${quality || 75}`
}
