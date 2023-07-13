/**
 * A shared function, used on both client and server, to generate a SVG blur placeholder.
 */
export function getImageBlurSvg({
  widthInt,
  heightInt,
  blurWidth,
  blurHeight,
  blurDataURL,
  objectFit,
}: {
  widthInt?: number
  heightInt?: number
  blurWidth?: number
  blurHeight?: number
  blurDataURL: string
  objectFit?: string
}): string {
  const svgWidth = blurWidth || widthInt
  const svgHeight = blurHeight || heightInt

  if (svgWidth && svgHeight) {
    const std = blurWidth && blurHeight ? 1 : 20
    const smoothenMask = 15
    return `%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${svgWidth} ${svgHeight}' width='${svgWidth}' height='${svgHeight}'%3e%3cfilter id='b' color-interpolation-filters='sRGB'%3e%3cfeMorphology in='SourceAlpha' operator='dilate' radius='${smoothenMask}' result='d'%3e%3c/feMorphology%3e%3cfeGaussianBlur in='d' stdDeviation='${smoothenMask}' result='m'%3e%3c/feGaussianBlur%3e%3cfeGaussianBlur in='SourceGraphic' stdDeviation='${std}' result='b'%3e%3c/feGaussianBlur%3e%3cfeComponentTransfer in='b' result='s'%3e%3cfeFuncA type='table' tableValues='1 1'%3e%3c/feFuncA%3e%3c/feComponentTransfer%3e%3cfeComposite in2='m' in='s' operator='in' result='c'%3e%3c/feComposite%3e%3cfeMerge%3e%3cfeMergeNode in='SourceGraphic'/%3e%3cfeMergeNode in='c'/%3e%3c/feMerge%3e%3c/filter%3e%3cimage style='filter: url(%23b);' x='0' y='0' width='100%25' height='100%25' preserveAspectRatio='none' href='${blurDataURL}'%3e%3c/image%3e%3c/svg%3e`
  }
  const preserveAspectRatio =
    objectFit === 'contain'
      ? 'xMidYMid'
      : objectFit === 'cover'
      ? 'xMidYMid slice'
      : 'none'
  return `%3Csvg xmlns='http%3A//www.w3.org/2000/svg'%3E%3Cimage style='filter:blur(20px)' preserveAspectRatio='${preserveAspectRatio}' x='0' y='0' height='100%25' width='100%25' href='${blurDataURL}'/%3E%3C/svg%3E`
}
