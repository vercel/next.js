import NextImage from 'next/image'
import { transformImageUrl } from '@kentico/kontent-delivery'

const KONTENT_ASSET_HOSTNAME_REGEX = /.kc-usercontent.com$/

const getLoader = (src) => {
  return srcIsKontentAsset(src) ? kontentImageLoader : undefined
}

const srcIsKontentAsset = (src) => {
  try {
    const { hostname } = new URL(src)
    return KONTENT_ASSET_HOSTNAME_REGEX.test(hostname)
  } catch {
    return false
  }
}

const kontentImageLoader = ({ src, width, quality = 100 }) => {
  return new transformImageUrl(src)
    .withWidth(width)
    .withQuality(quality)
    .withCompression('lossless')
    .withAutomaticFormat()
    .getUrl()
}

export default function Image(props) {
  const loader = getLoader(props.src)

  return <NextImage {...props} loader={loader} />
}
