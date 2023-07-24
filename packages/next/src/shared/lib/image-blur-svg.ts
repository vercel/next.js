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
  const std = 20
  const svgWidth = blurWidth ? blurWidth * 40 : widthInt
  const svgHeight = blurHeight ? blurHeight * 40 : heightInt

  const viewBox =
    svgWidth && svgHeight ? `viewBox='0 0 ${svgWidth} ${svgHeight}'` : ''
  const preserveAspectRatio = viewBox
    ? 'none'
    : objectFit === 'contain'
    ? 'xMidYMid'
    : objectFit === 'cover'
    ? 'xMidYMid slice'
    : 'none'

  return `%3csvg xmlns='http://www.w3.org/2000/svg' ${viewBox}%3e%3cfilter id='b' color-interpolation-filters='sRGB'%3e%3cfeGaussianBlur stdDeviation='${std}'/%3e%3cfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3e%3cfeFlood x='0' y='0' width='100%25' height='100%25'/%3e%3cfeComposite operator='out' in='s'/%3e%3cfeComposite in2='SourceGraphic'/%3e%3cfeGaussianBlur stdDeviation='${std}'/%3e%3c/filter%3e%3cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='${preserveAspectRatio}' style='filter: url(%23b);' href='${blurDataURL}'/%3e%3c/svg%3e`
}
