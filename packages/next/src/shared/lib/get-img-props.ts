import { warnOnce } from './utils/warn-once'
import { getImageBlurSvg } from './image-blur-svg'
import { imageConfigDefault } from './image-config'
import type {
  ImageConfigComplete,
  ImageLoaderProps,
  ImageLoaderPropsWithConfig,
} from './image-config'

export interface StaticImageData {
  src: string
  height: number
  width: number
  blurDataURL?: string
  blurWidth?: number
  blurHeight?: number
}

export interface StaticRequire {
  default: StaticImageData
}

export type StaticImport = StaticRequire | StaticImageData

export type ImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'src' | 'srcSet' | 'ref' | 'alt' | 'width' | 'height' | 'loading'
> & {
  src: string | StaticImport
  alt: string
  width?: number | `${number}`
  height?: number | `${number}`
  fill?: boolean
  loader?: ImageLoader
  quality?: number | `${number}`
  priority?: boolean
  loading?: LoadingValue
  placeholder?: PlaceholderValue
  blurDataURL?: string
  unoptimized?: boolean
  /**
   * @deprecated Use `onLoad` instead.
   * @see https://nextjs.org/docs/app/api-reference/components/image#onload
   */
  onLoadingComplete?: OnLoadingComplete
  /**
   * @deprecated Use `fill` prop instead of `layout="fill"` or change import to `next/legacy/image`.
   * @see https://nextjs.org/docs/api-reference/next/legacy/image
   */
  layout?: string
  /**
   * @deprecated Use `style` prop instead.
   */
  objectFit?: string
  /**
   * @deprecated Use `style` prop instead.
   */
  objectPosition?: string
  /**
   * @deprecated This prop does not do anything.
   */
  lazyBoundary?: string
  /**
   * @deprecated This prop does not do anything.
   */
  lazyRoot?: string
}

export type ImgProps = Omit<ImageProps, 'src' | 'alt' | 'loader'> & {
  loading: LoadingValue
  width: number | undefined
  height: number | undefined
  style: NonNullable<JSX.IntrinsicElements['img']['style']>
  sizes: string | undefined
  srcSet: string | undefined
  src: string
}

const VALID_LOADING_VALUES = ['lazy', 'eager', undefined] as const
type LoadingValue = (typeof VALID_LOADING_VALUES)[number]
type ImageConfig = ImageConfigComplete & {
  allSizes: number[]
  output?: 'standalone' | 'export'
}

export type ImageLoader = (p: ImageLoaderProps) => string

// Do not export - this is an internal type only
// because `next.config.js` is only meant for the
// built-in loaders, not for a custom loader() prop.
type ImageLoaderWithConfig = (p: ImageLoaderPropsWithConfig) => string

export type PlaceholderValue = 'blur' | 'empty' | `data:image/${string}`
export type OnLoad = React.ReactEventHandler<HTMLImageElement> | undefined
export type OnLoadingComplete = (img: HTMLImageElement) => void

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

const allImgs = new Map<
  string,
  { src: string; priority: boolean; placeholder: PlaceholderValue }
>()
let perfObserver: PerformanceObserver | undefined

function getInt(x: unknown): number | undefined {
  if (typeof x === 'undefined') {
    return x
  }
  if (typeof x === 'number') {
    return Number.isFinite(x) ? x : NaN
  }
  if (typeof x === 'string' && /^[0-9]+$/.test(x)) {
    return parseInt(x, 10)
  }
  return NaN
}

function getWidths(
  { deviceSizes, allSizes }: ImageConfig,
  width: number | undefined,
  sizes: string | undefined
): { widths: number[]; kind: 'w' | 'x' } {
  if (sizes) {
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
  if (typeof width !== 'number') {
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
  width,
  quality,
  sizes,
  loader,
}: GenImgAttrsData): GenImgAttrsResult {
  if (unoptimized) {
    return { src, srcSet: undefined, sizes: undefined }
  }

  const { widths, kind } = getWidths(config, width, sizes)
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

/**
 * A shared function, used on both client and server, to generate the props for <img>.
 */
export function getImgProps(
  {
    src,
    sizes,
    unoptimized = false,
    priority = false,
    loading,
    className,
    quality,
    width,
    height,
    fill = false,
    style,
    onLoad,
    onLoadingComplete,
    placeholder = 'empty',
    blurDataURL,
    fetchPriority,
    layout,
    objectFit,
    objectPosition,
    lazyBoundary,
    lazyRoot,
    ...rest
  }: ImageProps,
  _state: {
    defaultLoader: ImageLoaderWithConfig
    imgConf: ImageConfigComplete
    showAltText?: boolean
    blurComplete?: boolean
  }
): {
  props: ImgProps
  meta: {
    unoptimized: boolean
    priority: boolean
    placeholder: NonNullable<ImageProps['placeholder']>
    fill: boolean
  }
} {
  const { imgConf, showAltText, blurComplete, defaultLoader } = _state
  let config: ImageConfig
  let c = imgConf || imageConfigDefault
  if ('allSizes' in c) {
    config = c as ImageConfig
  } else {
    const allSizes = [...c.deviceSizes, ...c.imageSizes].sort((a, b) => a - b)
    const deviceSizes = c.deviceSizes.sort((a, b) => a - b)
    config = { ...c, allSizes, deviceSizes }
  }

  let loader: ImageLoaderWithConfig = rest.loader || defaultLoader

  // Remove property so it's not spread on <img> element
  delete rest.loader
  delete (rest as any).srcSet

  // This special value indicates that the user
  // didn't define a "loader" prop or "loader" config.
  const isDefaultLoader = '__next_img_default' in loader

  if (isDefaultLoader) {
    if (config.loader === 'custom') {
      throw new Error(
        `Image with src "${src}" is missing "loader" prop.` +
          `\nRead more: https://nextjs.org/docs/messages/next-image-missing-loader`
      )
    }
  } else {
    // The user defined a "loader" prop or config.
    // Since the config object is internal only, we
    // must not pass it to the user-defined "loader".
    const customImageLoader = loader as ImageLoader
    loader = (obj) => {
      const { config: _, ...opts } = obj
      return customImageLoader(opts)
    }
  }

  if (layout) {
    if (layout === 'fill') {
      fill = true
    }
    const layoutToStyle: Record<string, Record<string, string> | undefined> = {
      intrinsic: { maxWidth: '100%', height: 'auto' },
      responsive: { width: '100%', height: 'auto' },
    }
    const layoutToSizes: Record<string, string | undefined> = {
      responsive: '100vw',
      fill: '100vw',
    }
    const layoutStyle = layoutToStyle[layout]
    if (layoutStyle) {
      style = { ...style, ...layoutStyle }
    }
    const layoutSizes = layoutToSizes[layout]
    if (layoutSizes && !sizes) {
      sizes = layoutSizes
    }
  }

  let staticSrc = ''
  let widthInt = getInt(width)
  let heightInt = getInt(height)
  let blurWidth: number | undefined
  let blurHeight: number | undefined
  if (isStaticImport(src)) {
    const staticImageData = isStaticRequire(src) ? src.default : src

    if (!staticImageData.src) {
      throw new Error(
        `An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(
          staticImageData
        )}`
      )
    }
    if (!staticImageData.height || !staticImageData.width) {
      throw new Error(
        `An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(
          staticImageData
        )}`
      )
    }

    blurWidth = staticImageData.blurWidth
    blurHeight = staticImageData.blurHeight
    blurDataURL = blurDataURL || staticImageData.blurDataURL
    staticSrc = staticImageData.src

    if (!fill) {
      if (!widthInt && !heightInt) {
        widthInt = staticImageData.width
        heightInt = staticImageData.height
      } else if (widthInt && !heightInt) {
        const ratio = widthInt / staticImageData.width
        heightInt = Math.round(staticImageData.height * ratio)
      } else if (!widthInt && heightInt) {
        const ratio = heightInt / staticImageData.height
        widthInt = Math.round(staticImageData.width * ratio)
      }
    }
  }
  src = typeof src === 'string' ? src : staticSrc

  let isLazy =
    !priority && (loading === 'lazy' || typeof loading === 'undefined')
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
    // https://developer.mozilla.org/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
    unoptimized = true
    isLazy = false
  }
  if (config.unoptimized) {
    unoptimized = true
  }
  if (isDefaultLoader && src.endsWith('.svg') && !config.dangerouslyAllowSVG) {
    // Special case to make svg serve as-is to avoid proxying
    // through the built-in Image Optimization API.
    unoptimized = true
  }
  if (priority) {
    fetchPriority = 'high'
  }

  const qualityInt = getInt(quality)

  if (process.env.NODE_ENV !== 'production') {
    if (config.output === 'export' && isDefaultLoader && !unoptimized) {
      throw new Error(
        `Image Optimization using the default loader is not compatible with \`{ output: 'export' }\`.
  Possible solutions:
    - Remove \`{ output: 'export' }\` and run "next start" to run server mode including the Image Optimization API.
    - Configure \`{ images: { unoptimized: true } }\` in \`next.config.js\` to disable the Image Optimization API.
  Read more: https://nextjs.org/docs/messages/export-image-api`
      )
    }
    if (!src) {
      // React doesn't show the stack trace and there's
      // no `src` to help identify which image, so we
      // instead console.error(ref) during mount.
      unoptimized = true
    } else {
      if (fill) {
        if (width) {
          throw new Error(
            `Image with src "${src}" has both "width" and "fill" properties. Only one should be used.`
          )
        }
        if (height) {
          throw new Error(
            `Image with src "${src}" has both "height" and "fill" properties. Only one should be used.`
          )
        }
        if (style?.position && style.position !== 'absolute') {
          throw new Error(
            `Image with src "${src}" has both "fill" and "style.position" properties. Images with "fill" always use position absolute - it cannot be modified.`
          )
        }
        if (style?.width && style.width !== '100%') {
          throw new Error(
            `Image with src "${src}" has both "fill" and "style.width" properties. Images with "fill" always use width 100% - it cannot be modified.`
          )
        }
        if (style?.height && style.height !== '100%') {
          throw new Error(
            `Image with src "${src}" has both "fill" and "style.height" properties. Images with "fill" always use height 100% - it cannot be modified.`
          )
        }
      } else {
        if (typeof widthInt === 'undefined') {
          throw new Error(
            `Image with src "${src}" is missing required "width" property.`
          )
        } else if (isNaN(widthInt)) {
          throw new Error(
            `Image with src "${src}" has invalid "width" property. Expected a numeric value in pixels but received "${width}".`
          )
        }
        if (typeof heightInt === 'undefined') {
          throw new Error(
            `Image with src "${src}" is missing required "height" property.`
          )
        } else if (isNaN(heightInt)) {
          throw new Error(
            `Image with src "${src}" has invalid "height" property. Expected a numeric value in pixels but received "${height}".`
          )
        }
      }
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
    if (
      placeholder !== 'empty' &&
      placeholder !== 'blur' &&
      !placeholder.startsWith('data:image/')
    ) {
      throw new Error(
        `Image with src "${src}" has invalid "placeholder" property "${placeholder}".`
      )
    }
    if (placeholder !== 'empty') {
      if (widthInt && heightInt && widthInt * heightInt < 1600) {
        warnOnce(
          `Image with src "${src}" is smaller than 40x40. Consider removing the "placeholder" property to improve performance.`
        )
      }
    }
    if (placeholder === 'blur' && !blurDataURL) {
      const VALID_BLUR_EXT = ['jpeg', 'png', 'webp', 'avif'] // should match next-image-loader

      throw new Error(
        `Image with src "${src}" has "placeholder='blur'" property but is missing the "blurDataURL" property.
        Possible solutions:
          - Add a "blurDataURL" property, the contents should be a small Data URL to represent the image
          - Change the "src" property to a static import with one of the supported file types: ${VALID_BLUR_EXT.join(
            ','
          )} (animated images not supported)
          - Remove the "placeholder" property, effectively no blur effect
        Read more: https://nextjs.org/docs/messages/placeholder-blur-data-url`
      )
    }
    if ('ref' in rest) {
      warnOnce(
        `Image with src "${src}" is using unsupported "ref" property. Consider using the "onLoad" property instead.`
      )
    }

    if (!unoptimized && !isDefaultLoader) {
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

    if (onLoadingComplete) {
      warnOnce(
        `Image with src "${src}" is using deprecated "onLoadingComplete" property. Please use the "onLoad" property instead.`
      )
    }

    for (const [legacyKey, legacyValue] of Object.entries({
      layout,
      objectFit,
      objectPosition,
      lazyBoundary,
      lazyRoot,
    })) {
      if (legacyValue) {
        warnOnce(
          `Image with src "${src}" has legacy prop "${legacyKey}". Did you forget to run the codemod?` +
            `\nRead more: https://nextjs.org/docs/messages/next-image-upgrade-to-13`
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
            lcpImage.placeholder === 'empty' &&
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
    fill
      ? {
          position: 'absolute',
          height: '100%',
          width: '100%',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          objectFit,
          objectPosition,
        }
      : {},
    showAltText ? {} : { color: 'transparent' },
    style
  )

  const backgroundImage =
    !blurComplete && placeholder !== 'empty'
      ? placeholder === 'blur'
        ? `url("data:image/svg+xml;charset=utf-8,${getImageBlurSvg({
            widthInt,
            heightInt,
            blurWidth,
            blurHeight,
            blurDataURL: blurDataURL || '', // assume not undefined
            objectFit: imgStyle.objectFit,
          })}")`
        : `url("${placeholder}")` // assume `data:image/`
      : null

  let placeholderStyle = backgroundImage
    ? {
        backgroundSize: imgStyle.objectFit || 'cover',
        backgroundPosition: imgStyle.objectPosition || '50% 50%',
        backgroundRepeat: 'no-repeat',
        backgroundImage,
      }
    : {}

  if (process.env.NODE_ENV === 'development') {
    if (
      placeholderStyle.backgroundImage &&
      placeholder === 'blur' &&
      blurDataURL?.startsWith('/')
    ) {
      // During `next dev`, we don't want to generate blur placeholders with webpack
      // because it can delay starting the dev server. Instead, `next-image-loader.js`
      // will inline a special url to lazily generate the blur placeholder at request time.
      placeholderStyle.backgroundImage = `url("${blurDataURL}")`
    }
  }

  const imgAttributes = generateImgAttrs({
    config,
    src,
    unoptimized,
    width: widthInt,
    quality: qualityInt,
    sizes,
    loader,
  })

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

  const props: ImgProps = {
    ...rest,
    loading: isLazy ? 'lazy' : loading,
    fetchPriority,
    width: widthInt,
    height: heightInt,
    decoding: 'async',
    className,
    style: { ...imgStyle, ...placeholderStyle },
    sizes: imgAttributes.sizes,
    srcSet: imgAttributes.srcSet,
    src: imgAttributes.src,
  }
  const meta = { unoptimized, priority, placeholder, fill }
  return { props, meta }
}
