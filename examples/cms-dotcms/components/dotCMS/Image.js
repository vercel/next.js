// Dependencies
import Image from 'next/image'

export const DotCMSImage = ({
  alt,
  path,
  identifier,
  name,
  className,
  ...props
}) => {
  const filterUrl = `/filter/resize_w/${
    props.width || props.height || 1000
  }/20q`
  let srcUrl = ''

  if (path) {
    srcUrl += `${path}`
  }

  if (identifier && name) {
    srcUrl += `/dA/${identifier}/${name}`
  }

  const src = `${srcUrl}${filterUrl}`

  if (props.width && props.height) {
    props.width = props.width
    props.height = props.height
  } else {
    props.layout = 'fill'
  }

  const dotCmsLoader = ({ src, width }) => {
    return `${process.env.NEXT_PUBLIC_DOTCMS_HOST}${src}?w=${width}`
  }

  // @ts-ignore - TODO: fix this type searching more accurately
  // type src is incompatible with `StaticImport`
  return (
    <Image
      {...props}
      alt={alt}
      className={className}
      loader={dotCmsLoader}
      src={src}
    />
  )
}

export default DotCMSImage
