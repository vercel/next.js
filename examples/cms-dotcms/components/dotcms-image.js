import Image from 'next/image'

const dotCmsLoader = ({ src, width }) => {
  return `${process.env.NEXT_PUBLIC_DOTCMS_HOST}/${src}?w=${width}`
}

const DotCmsImage = (props) => {
  return <Image loader={dotCmsLoader} {...props} />
}

export default DotCmsImage
