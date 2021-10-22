import Image from 'next/image'

const dotCmsLoader = ({ src, width }) => {
  return `${process.env.NEXT_PUBLIC_DOTCMS_HOST}${src}?w=${width}`
}

const DotCmsImage = (props) => {
  if (!props.src) {
    return (
      <div
        className="w-full bg-gradient-to-tr from-[#576BE8] to-[#1B3359]"
        style={{
          minHeight: props.height
        }}
      ></div>
    )
  }

  return <Image loader={dotCmsLoader} {...props} />
}

export default DotCmsImage
