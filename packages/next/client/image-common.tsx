import React, { useCallback } from 'react'
import { ImageConfigComplete } from '../shared/lib/image-config'
import { warnOnce } from '../shared/lib/utils'
import type { ImageProps } from './image'

export const emptyDataURL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
export const loadedImageURLs = new Set<string>()
export const VALID_LOADING_VALUES = ['lazy', 'eager', undefined] as const
export const VALID_LAYOUT_VALUES = [
  'fill',
  'fixed',
  'intrinsic',
  'responsive',
  'raw',
  undefined,
] as const
export type LayoutValue = typeof VALID_LAYOUT_VALUES[number]
export type LoadingValue = typeof VALID_LOADING_VALUES[number]
export type PlaceholderValue = 'blur' | 'empty'
export type ImageConfig = ImageConfigComplete & { allSizes: number[] }
export type ImgElementStyle = NonNullable<JSX.IntrinsicElements['img']['style']>
export type OnLoadingComplete = (result: {
  naturalWidth: number
  naturalHeight: number
}) => void

export type ImageLoaderWithConfig = (
  resolverProps: ImageLoaderPropsWithConfig
) => string
export type ImageLoaderPropsWithConfig = ImageLoaderProps & {
  config: Readonly<ImageConfig>
}

export type ImageLoaderProps = {
  src: string
  width: number
  quality?: number
}

export type GenImgAttrsData = {
  config: ImageConfig
  src: string
  unoptimized: boolean
  layout: LayoutValue
  loader: ImageLoaderWithConfig
  width?: number
  quality?: number
  sizes?: string
}

export type GenImgAttrsResult = {
  src: string
  srcSet: string | undefined
  sizes: string | undefined
}

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

export type StaticImport = StaticRequire | StaticImageData

export function isStaticRequire(
  src: StaticRequire | StaticImageData
): src is StaticRequire {
  return (src as StaticRequire).default !== undefined
}

function isStaticImageData(
  src: StaticRequire | StaticImageData
): src is StaticImageData {
  return (src as StaticImageData).src !== undefined
}

export function isStaticImport(
  src: string | StaticImport
): src is StaticImport {
  return (
    typeof src === 'object' &&
    (isStaticRequire(src as StaticImport) ||
      isStaticImageData(src as StaticImport))
  )
}

export function getWidths(
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

export function getInt(x: unknown): number | undefined {
  if (typeof x === 'number') {
    return x
  }
  if (typeof x === 'string') {
    return parseInt(x, 10)
  }
  return undefined
}

export function generateImgAttrs({
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

export const ImageElement = ({
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
        {...(layout === 'raw' ? { height: heightInt, width: widthInt } : {})}
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
            {...(layout === 'raw'
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
      if (layout === 'raw') {
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
