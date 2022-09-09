import React, {
  useRef,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import Head from '../../shared/lib/head'
import { getImageBlurSvg } from '../../shared/lib/image-blur-svg'
import {
  ImageConfigComplete,
  imageConfigDefault,
} from '../../shared/lib/image-config'
import { ImageConfigContext } from '../../shared/lib/image-config-context'
import { warnOnce } from '../../shared/lib/utils'

const configEnv = process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete
const allImgs = new Map<
  string,
  { src: string; priority: boolean; placeholder: string }
>()
let perfObserver: PerformanceObserver | undefined

if (typeof window === 'undefined') {
  ;(global as any).__NEXT_IMAGE_IMPORTED = true
}

const VALID_LOADING_VALUES = ['lazy', 'eager', undefined] as const
type LoadingValue = typeof VALID_LOADING_VALUES[number]
type ImageConfig = ImageConfigComplete & { allSizes: number[] }
export type ImageLoader = (p: ImageLoaderProps) => string

export type ImageLoaderProps = {
  src: string
  width: number
  quality?: number
}

// Do not export - this is an internal type only
// because `next.config.js` is only meant for the
// built-in loaders, not for a custom loader() prop.
type ImageLoaderWithConfig = (p: ImageLoaderPropsWithConfig) => string
type ImageLoaderPropsWithConfig = ImageLoaderProps & {
  config: Readonly<ImageConfig>
}

type PlaceholderValue = 'blur' | 'empty'

type OnLoadingComplete = (img: HTMLImageElement) => void

type ImgElementStyle = NonNullable<JSX.IntrinsicElements['img']['style']>

type ImgElementWithDataProp = HTMLImageElement & {
  'data-loaded-src': string | undefined
}

export interface StaticImageData {
  src: string
  height: number
  width: number
  blurDataURL?: string
  blurWidth?: number
  blurHeight?: number
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
  'src' | 'srcSet' | 'ref' | 'alt' | 'width' | 'height' | 'loading'
> & {
  src: string | StaticImport
  alt: string
  width?: number | string
  height?: number | string
  fill?: boolean
  loader?: ImageLoader
  quality?: number | string
  priority?: boolean
  loading?: LoadingValue
  placeholder?: PlaceholderValue
  blurDataURL?: string
  unoptimized?: boolean
  onLoadingComplete?: OnLoadingComplete
}

type ImageElementProps = Omit<ImageProps, 'src' | 'alt' | 'loader'> & {
  srcString: string
  imgAttributes: GenImgAttrsResult
  heightInt: number | undefined
  widthInt: number | undefined
  qualityInt: number | undefined
  imgStyle: ImgElementStyle
  blurStyle: ImgElementStyle
  isLazy: boolean
  fill?: boolean
  loading: LoadingValue
  config: ImageConfig
  unoptimized: boolean
  loader: ImageLoaderWithConfig
  placeholder: PlaceholderValue
  onLoadingCompleteRef: React.MutableRefObject<OnLoadingComplete | undefined>
  setBlurComplete: (b: boolean) => void
  setShowAltText: (b: boolean) => void
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

function getInt(x: unknown): number | undefined {
  if (typeof x === 'number' || typeof x === 'undefined') {
    return x
  }
  if (typeof x === 'string' && /^[0-9]+$/.test(x)) {
    return parseInt(x, 10)
  }
  return NaN
}

// See https://stackoverflow.com/q/39777833/266535 for why we use this ref
// handler instead of the img's onLoad attribute.
function handleLoading(
  img: ImgElementWithDataProp,
  src: string,
  placeholder: PlaceholderValue,
  onLoadingCompleteRef: React.MutableRefObject<OnLoadingComplete | undefined>,
  setBlurComplete: (b: boolean) => void
) {
  if (!img || img['data-loaded-src'] === src) {
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
    if (placeholder === 'blur') {
      setBlurComplete(true)
    }
    if (onLoadingCompleteRef?.current) {
      onLoadingCompleteRef.current(img)
    }
    if (process.env.NODE_ENV !== 'production') {
      if (img.getAttribute('data-nimg') === 'future-fill') {
        if (
          !img.getAttribute('sizes') ||
          img.getAttribute('sizes') === '100vw'
        ) {
          let widthViewportRatio =
            img.getBoundingClientRect().width / window.innerWidth
          if (widthViewportRatio < 0.6) {
            warnOnce(
              `Image with src "${src}" has "fill" but is missing "sizes" prop. Please add it to improve page performance. Read more: https://nextjs.org/docs/api-reference/next/future/image#sizes`
            )
          }
        }
        if (img.parentElement) {
          const { position } = window.getComputedStyle(img.parentElement)
          const valid = ['absolute', 'fixed', 'relative']
          if (!valid.includes(position)) {
            warnOnce(
              `Image with src "${src}" has "fill" and parent element with invalid "position". Provided "${position}" should be one of ${valid
                .map(String)
                .join(',')}.`
            )
          }
        }
        if (img.height === 0) {
          warnOnce(
            `Image with src "${src}" has "fill" and a height value of 0. This is likely because the parent element of the image has not been styled to have a set height.`
          )
        }
      }

      const heightModified =
        img.height.toString() !== img.getAttribute('height')
      const widthModified = img.width.toString() !== img.getAttribute('width')
      if (
        (heightModified && !widthModified) ||
        (!heightModified && widthModified)
      ) {
        warnOnce(
          `Image with src "${src}" has either width or height modified, but not the other. If you use CSS to change the size of your image, also include the styles 'width: "auto"' or 'height: "auto"' to maintain the aspect ratio.`
        )
      }
    }
  })
}

const ImageElement = ({
  imgAttributes,
  heightInt,
  widthInt,
  qualityInt,
  className,
  imgStyle,
  blurStyle,
  isLazy,
  fill,
  placeholder,
  loading,
  srcString,
  config,
  unoptimized,
  loader,
  onLoadingCompleteRef,
  setBlurComplete,
  setShowAltText,
  onLoad,
  onError,
  ...rest
}: ImageElementProps) => {
  loading = isLazy ? 'lazy' : loading
  return (
    <>
      <img
        {...rest}
        {...imgAttributes}
        width={widthInt}
        height={heightInt}
        decoding="async"
        data-nimg={`future${fill ? '-fill' : ''}`}
        className={className}
        // @ts-ignore - TODO: upgrade to `@types/react@17`
        loading={loading}
        style={{ ...imgStyle, ...blurStyle }}
        ref={useCallback(
          (img: ImgElementWithDataProp | null) => {
            if (!img) {
              return
            }
            if (onError) {
              // If the image has an error before react hydrates, then the error is lost.
              // The workaround is to wait until the image is mounted which is after hydration,
              // then we set the src again to trigger the error handler (if there was an error).
              // eslint-disable-next-line no-self-assign
              img.src = img.src
            }
            if (process.env.NODE_ENV !== 'production') {
              if (!srcString) {
                console.error(`Image is missing required "src" property:`, img)
              }
              if (
                img.getAttribute('objectFit') ||
                img.getAttribute('objectfit')
              ) {
                console.error(
                  `Image has unknown prop "objectFit". Did you mean to use the "style" prop instead?`,
                  img
                )
              }
              if (
                img.getAttribute('objectPosition') ||
                img.getAttribute('objectposition')
              ) {
                console.error(
                  `Image has unknown prop "objectPosition". Did you mean to use the "style" prop instead?`,
                  img
                )
              }
              if (img.getAttribute('alt') === null) {
                console.error(
                  `Image is missing required "alt" property. Please add Alternative Text to describe the image for screen readers and search engines.`
                )
              }
            }
            if (img.complete) {
              handleLoading(
                img,
                srcString,
                placeholder,
                onLoadingCompleteRef,
                setBlurComplete
              )
            }
          },
          [
            srcString,
            placeholder,
            onLoadingCompleteRef,
            setBlurComplete,
            onError,
          ]
        )}
        onLoad={(event) => {
          const img = event.currentTarget as ImgElementWithDataProp
          handleLoading(
            img,
            srcString,
            placeholder,
            onLoadingCompleteRef,
            setBlurComplete
          )
          if (onLoad) {
            onLoad(event)
          }
        }}
        onError={(event) => {
          // if the real image fails to load, this will ensure "alt" is visible
          setShowAltText(true)
          if (placeholder === 'blur') {
            // If the real image fails to load, this will still remove the placeholder.
            setBlurComplete(true)
          }
          if (onError) {
            onError(event)
          }
        }}
      />
    </>
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

    if (!src.startsWith('/') && (config.domains || config.remotePatterns)) {
      let parsedSrc: URL
      try {
        parsedSrc = new URL(src)
      } catch (err) {
        console.error(err)
        throw new Error(
          `Failed to parse src "${src}" on \`next/image\`, if using relative image it must start with a leading slash "/" or be an absolute URL (http:// or https://)`
        )
      }

      if (process.env.NODE_ENV !== 'test') {
        // We use dynamic require because this should only error in development
        const { hasMatch } = require('../../shared/lib/match-remote-pattern')
        if (!hasMatch(config.domains, config.remotePatterns, parsedSrc)) {
          throw new Error(
            `Invalid src prop (${src}) on \`next/image\`, hostname "${parsedSrc.hostname}" is not configured under images in your \`next.config.js\`\n` +
              `See more info: https://nextjs.org/docs/messages/next-image-unconfigured-host`
          )
        }
      }
    }
  }

  if (src.endsWith('.svg') && !config.dangerouslyAllowSVG) {
    // Special case to make svg serve as-is to avoid proxying
    // through the built-in Image Optimization API.
    return src
  }

  return `${config.path}?url=${encodeURIComponent(src)}&w=${width}&q=${
    quality || 75
  }`
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
  fill,
  style,
  onLoadingComplete,
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

  let loader: ImageLoaderWithConfig = defaultLoader
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
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
    unoptimized = true
    isLazy = false
  }
  if (config.unoptimized) {
    unoptimized = true
  }

  const [blurComplete, setBlurComplete] = useState(false)
  const [showAltText, setShowAltText] = useState(false)

  const qualityInt = getInt(quality)

  if (process.env.NODE_ENV !== 'production') {
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

    if (placeholder === 'blur') {
      if (widthInt && heightInt && widthInt * heightInt < 1600) {
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

    if (!unoptimized && loader !== defaultLoader) {
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
    fill
      ? {
          position: 'absolute',
          height: '100%',
          width: '100%',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
        }
      : {},
    showAltText ? {} : { color: 'transparent' },
    style
  )

  const blurStyle =
    placeholder === 'blur' && blurDataURL && !blurComplete
      ? {
          backgroundSize: imgStyle.objectFit || 'cover',
          backgroundPosition: imgStyle.objectPosition || '50% 50%',
          backgroundRepeat: 'no-repeat',
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,${getImageBlurSvg(
            {
              widthInt,
              heightInt,
              blurWidth,
              blurHeight,
              blurDataURL,
            }
          )}")`,
        }
      : {}

  if (process.env.NODE_ENV === 'development') {
    if (blurStyle.backgroundImage && blurDataURL?.startsWith('/')) {
      // During `next dev`, we don't want to generate blur placeholders with webpack
      // because it can delay starting the dev server. Instead, `next-image-loader.js`
      // will inline a special url to lazily generate the blur placeholder at request time.
      blurStyle.backgroundImage = `url("${blurDataURL}")`
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

  const onLoadingCompleteRef = useRef(onLoadingComplete)

  useEffect(() => {
    onLoadingCompleteRef.current = onLoadingComplete
  }, [onLoadingComplete])

  const imgElementArgs: ImageElementProps = {
    isLazy,
    imgAttributes,
    heightInt,
    widthInt,
    qualityInt,
    className,
    imgStyle,
    blurStyle,
    loading,
    config,
    fill,
    unoptimized,
    placeholder,
    loader,
    srcString,
    onLoadingCompleteRef,
    setBlurComplete,
    setShowAltText,
    ...rest,
  }
  return (
    <>
      {<ImageElement {...imgElementArgs} />}
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
