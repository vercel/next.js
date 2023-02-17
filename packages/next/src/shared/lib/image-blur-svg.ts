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
  const std = blurWidth && blurHeight ? '1' : '20'
  const svgWidth = blurWidth || widthInt
  const svgHeight = blurHeight || heightInt
  const feComponentTransfer = blurDataURL.startsWith('data:image/jpeg')
    ? `%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1'/%3E%3C/feComponentTransfer%3E%`
    : ''
  if (svgWidth && svgHeight) {
    return `%3Csvg xmlns='http%3A//www.w3.org/2000/svg' viewBox='0 0 ${svgWidth} ${svgHeight}'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='${std}'/%3E${feComponentTransfer}%3C/filter%3E%3Cimage preserveAspectRatio='none' filter='url(%23b)' x='0' y='0' height='100%25' width='100%25' href='${blurDataURL}'/%3E%3C/svg%3E`
  }
  const preserveAspectRatio =
    objectFit === 'contain'
      ? 'xMidYMid'
      : objectFit === 'cover'
      ? 'xMidYMid slice'
      : 'none'
  return `%3Csvg xmlns='http%3A//www.w3.org/2000/svg'%3E%3Cimage style='filter:blur(20px)' preserveAspectRatio='${preserveAspectRatio}' x='0' y='0' height='100%25' width='100%25' href='${blurDataURL}'/%3E%3C/svg%3E`
}
