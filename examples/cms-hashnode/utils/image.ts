type ResizeImageResizeOptions = {
  w?: number
  h?: number
  mask?: string
  'corner-radius'?: string
  fill?: string
  c?: string
  q?: string
}

export function resizeImage(
  src: string,
  resize: ResizeImageResizeOptions,
  defaultImage?: string
): string
// must provide a default image in case the src can be null or undefined
export function resizeImage(
  src: string | null | undefined,
  resize: ResizeImageResizeOptions,
  defaultImage: string
): string
export function resizeImage(
  src: string | null | undefined,
  resize: ResizeImageResizeOptions,
  defaultImage?: string
): string {
  if (!src) {
    return defaultImage as string
  }

  let newSrc = src.replace('hashnode.imgix.net', 'cdn.hashnode.com')
  if (
    src.indexOf('//res.cloudinary.com/hashnode') !== -1 &&
    src.indexOf('/upload/') !== -1
  ) {
    const parts = src.split('/upload/')
    const format = parts[1].substring(parts[1].lastIndexOf('.') + 1)
    if (parts[1].indexOf('ama_banners') !== -1) {
      const version = parts[1].substring(1, parts[1].indexOf('/'))
      const path = parts[1].substring(
        parts[1].indexOf('/') + 1,
        parts[1].lastIndexOf('.')
      )
      newSrc = `${parts[0]}/upload/${path}/${version}.${format}?auto=compress,format&format=webp`
    } else {
      const nextParts = parts[1].split('/')
      if (nextParts[0].indexOf('v') === 0) {
        nextParts[0] = nextParts[0].substring(1)
      }
      newSrc = `${parts[0]}/upload/${nextParts[1].substring(
        0,
        nextParts[1].lastIndexOf('.')
      )}/${nextParts[0]}.${format}?auto=compress,format&format=webp`
    }
    newSrc = newSrc
      .replace('//res.cloudinary.com', '//cdn.hashnode.com/res')
      .replace('http://', 'https://')
  } else if (
    src.indexOf('//cdn.hashnode.com') !== -1 &&
    src.indexOf('/upload/') !== -1
  ) {
    const parts = src.split('/upload/')
    if (parts[1].indexOf('v') !== 0) {
      newSrc = `${parts[0]}/upload/${parts[1].substring(
        parts[1].indexOf('/') + 1
      )}`
    }
  }

  if (newSrc.indexOf('//cdn.hashnode.com') === -1) {
    return newSrc
  }

  let opts = ''
  Object.keys(resize).forEach((prop) => {
    if (
      prop === 'w' ||
      prop === 'h' ||
      prop === 'mask' ||
      prop === 'corner-radius'
    ) {
      opts += `${prop}=${resize[prop]}&`
    } else if (prop === 'fill') {
      opts += `fit=fill&fill=${resize[prop]}&`
    } else if (prop === 'c') {
      opts += `fit=crop&crop=${resize[prop] === 'face' ? 'faces' : 'entropy'}&`
    }
  })

  if (resize.q === 'none') {
    return `${newSrc}?${opts}`
  }

  if (newSrc.indexOf('?') !== -1) {
    let newSrcSplit = newSrc.split('?')
    newSrc = newSrcSplit[0]
    opts +=
      newSrcSplit[1].slice(-1) !== '&' ? `${newSrcSplit[1]}&` : newSrcSplit[1]
  }

  if (opts) {
    opts +=
      src.indexOf('.gif') !== -1
        ? 'auto=format,compress&gif-q=60&format=webm'
        : 'auto=compress,format&format=webp'
  } else {
    opts =
      src.indexOf('.gif') !== -1
        ? 'auto=format,compress&gif-q=60&format=webm'
        : 'auto=compress,format&format=webp'
  }

  return `${newSrc}?${opts}`
}
