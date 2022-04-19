// Rewrite in export mode not works.
// https://nextjs.org/docs/advanced-features/static-html-export
const dotCmsLoader = ({ src, width }) => {
  return {src:`${process.env.NEXT_PUBLIC_DOTCMS_HOST}${src}?w=${width}` }
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

  return <img {...props} {...dotCmsLoader({...props})}  />
}

export default DotCmsImage
