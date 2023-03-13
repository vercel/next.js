import Image from 'next/image'
const DEFAULT_QUALITY = 20

// https://dotcms.com/docs/latest/image-resizing-and-processing
const getUrlWithResizingParameters = ({
  src,
  width,
  quality = DEFAULT_QUALITY,
}) => {
  const urlParams = []
  const lastSeparatorIdx = src.lastIndexOf('/')
  const imageIdentifierAndField = src.slice(0, lastSeparatorIdx)

  urlParams.push(imageIdentifierAndField)
  urlParams.push(width + 'w')
  urlParams.push(quality + 'q')

  return urlParams.join('/')
}

const dotCmsLoader = (props) => {
  return `${process.env.NEXT_PUBLIC_DOTCMS_HOST}${getUrlWithResizingParameters(
    props
  )}`
}

const DotCmsImage = (params) => {
  return <Image {...params} loader={dotCmsLoader} />
}

export default DotCmsImage
