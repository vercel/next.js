import Image from 'next/image'

const dotCmsLoader = ({ src, width }) => {
  return `${process.env.NEXT_PUBLIC_DOTCMS_HOST}${getSourceWithFiltersParameters({src, width})}`
}

const DotCmsImage = ({...props}) => {

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

  return <Image {...props} loader={dotCmsLoader} {...props} />
}

// https://dotcms.com/docs/latest/image-resizing-and-processing
const getSourceWithFiltersParameters = ({src, width, quality = '20'})=>{
  const MAX_WIDTH_SIZE = 2000;
  const urlParams = [];
  const lastSeparatorIdx = src.lastIndexOf('/');
  const imageIdentifierAndField = src.slice(0, lastSeparatorIdx);

  urlParams.push(imageIdentifierAndField);

  if(width){
    const size = (width > MAX_WIDTH_SIZE) ? MAX_WIDTH_SIZE : width;
    urlParams.push(size + 'w');
  }
  if(quality){
    urlParams.push(quality + 'q');
  }
  return urlParams.join('/');

}

export default DotCmsImage
