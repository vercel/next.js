import React, { useRef, useEffect, useContext, useMemo, useState } from 'react'
import Head from '../shared/lib/head'
import {
  ImageConfigComplete,
  imageConfigDefault,
} from '../shared/lib/image-config'
import { ImageConfigContext } from '../shared/lib/image-config-context'
import { warnOnce } from '../shared/lib/utils'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'
import {
  generateImgAttrs,
  GenImgAttrsResult,
  getInt,
  ImageElement,
  ImageConfig,
  emptyDataURL,
  loadedImageURLs,
  VALID_LOADING_VALUES,
  LoadingValue,
  PlaceholderValue,
  OnLoadingComplete,
  ImageLoaderWithConfig,
  ImageLoaderProps,
  ImageLoaderPropsWithConfig,
  StaticImport,
  isStaticImport,
  isStaticRequire,
} from './image-common'

const { experimentalLayoutRaw = false, experimentalRemotePatterns = [] } =
  (process.env.__NEXT_IMAGE_OPTS as any) || {}
const configEnv = process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete
const allImgs = new Map<
  string,
  { src: string; priority: boolean; placeholder: string }
>()
let perfObserver: PerformanceObserver | undefined

if (typeof window === 'undefined') {
  ;(global as any).__NEXT_IMAGE_FUTURE_IMPORTED = true
}

export type ImageLoader = (resolverProps: ImageLoaderProps) => string

export type ImageProps = Omit<
  JSX.IntrinsicElements['img'],
  'src' | 'srcSet' | 'ref' | 'width' | 'height' | 'loading'
> & {
  src: string | StaticImport
  width?: number | string
  height?: number | string
  loader?: ImageLoader
  quality?: number | string
  priority?: boolean
  loading?: LoadingValue
  placeholder?: PlaceholderValue
  blurDataURL?: string
  unoptimized?: boolean
  onLoadingComplete?: OnLoadingComplete
}

export default function ImageFuture({
  src,
  sizes,
  unoptimized = false,
  priority = false,
  loading,
  className,
  quality,
  width,
  height,
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
  const isVisible = !isLazy

  if (process.env.NODE_ENV !== 'production') {
    if (!src) {
      throw new Error(
        `Image is missing required "src" property. Make sure you pass "src" in props to the \`next/image\` component. Received: ${JSON.stringify(
          { width, height, quality }
        )}`
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
      if ((widthInt || 0) * (heightInt || 0) < 1600) {
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

  const imgStyle = Object.assign({}, style)
  const blurStyle =
    placeholder === 'blur' && !blurComplete
      ? {
          filter: 'blur(20px)',
          backgroundSize: style?.objectFit || 'cover',
          backgroundImage: `url("${blurDataURL}")`,
          backgroundPosition: style?.objectPosition || '0% 0%',
        }
      : {}

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
      layout: 'raw',
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

  const onLoadingCompleteRef = useRef(onLoadingComplete)

  useEffect(() => {
    onLoadingCompleteRef.current = onLoadingComplete
  }, [onLoadingComplete])

  const imgElementArgs = {
    isLazy,
    imgAttributes,
    heightInt,
    widthInt,
    qualityInt,
    layout: 'raw' as const,
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
    setIntersection: () => {},
    isVisible,
    ...rest,
  }
  return (
    <>
      <ImageElement {...imgElementArgs} />
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

    if (
      !src.startsWith('/') &&
      (config.domains || experimentalRemotePatterns)
    ) {
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
        const { hasMatch } = require('../shared/lib/match-remote-pattern')
        if (!hasMatch(config.domains, experimentalRemotePatterns, parsedSrc)) {
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

  return `${normalizePathTrailingSlash(config.path)}?url=${encodeURIComponent(
    src
  )}&w=${width}&q=${quality || 75}`
}
