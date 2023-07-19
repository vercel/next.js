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
  const std = blurWidth && blurHeight ? 0.5 : 20
  const svgWidth = blurWidth || widthInt
  const svgHeight = blurHeight || heightInt

  const svgDimensions = svgWidth && svgHeight
  const svgSizeAttributes = svgDimensions
    ? `viewBox='0 0 ${svgWidth} ${svgHeight}'`
    : ''
  const preserveAspectRatio = svgDimensions
    ? 'none'
    : objectFit === 'contain'
    ? 'xMidYMid'
    : objectFit === 'cover'
    ? 'xMidYMid slice'
    : 'none'

  return `%3csvg xmlns='http://www.w3.org/2000/svg' ${svgSizeAttributes}%3e%3cfilter id='b' color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur stdDeviation='${std}'/%3e%3cfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3e%3cfeFlood x='0' y='0' width='100%25' height='100%25'/%3e%3cfeComposite operator='out' in='s'/%3e%3cfeComposite in2='SourceGraphic'/%3e%3cfeGaussianBlur stdDeviation='${std}'/%3e%3c/filter%3e%3cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='${preserveAspectRatio}' style='filter: url(%23b);' href='${blurDataURL}'/%3e%3c/svg%3e`
}
