const { DEFAULT_AVATAR } = require('./consts/images')

const DEFAULT_PHOTO = `${DEFAULT_AVATAR},format&format=webp`

const _resizeImage = (src, resize, defaultImage) => {
  if (!src) {
    return defaultImage
  } else {
    // temp
    if (src === '?sz=200') {
      return DEFAULT_PHOTO
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
        opts += `fit=crop&crop=${
          resize[prop] === 'face' ? 'faces' : 'entropy'
        }&`
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
}

exports.resizeImage = _resizeImage

exports.imageReplacer = (content, lazyLoad = false) => {
  var regex = /<img src="([^"]+)"/g
  var srcVals = content.match(regex)

  if (!srcVals) {
    return content
  }

  var map = {}
  srcVals.forEach((src) => {
    src = src.split('src=')[1].replace(/"/g, '')
    map[src] = _resizeImage(src, {})
  })
  var keys = Object.keys(map)
  keys.forEach((oldSrc) => {
    content = content.replace(oldSrc, map[oldSrc])
  })
  if (lazyLoad) {
    content = content.replace(/<img/g, '<img loading="lazy"')
  }
  return content
}

const _getBlurHash = (src) => {
  if (src && src.indexOf('?') === -1) {
    return `${src}?fm=blurhash`
  }
  return `${src}&fm=blurhash`
}

exports.getBlurHash = _getBlurHash

exports.ImageAlignment = {
  Center: 'center',
  Left: 'left',
  Right: 'right',
}
