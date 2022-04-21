import Image from 'next/image'

const MAX_WIDTH_SIZE = 2000;
const DEFAULT_QUALITY = 20;

const dotCmsLoader = (props) => {
  return `${process.env.NEXT_PUBLIC_DOTCMS_HOST}${getSourceWithFiltersParameters(props)}`
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

  return <Image {...props} loader={dotCmsLoader} />
}

// https://dotcms.com/docs/latest/image-resizing-and-processing
const getSourceWithFiltersParameters = ({src, width, quality = DEFAULT_QUALITY})=>{

  const urlParams = [];
  const lastSeparatorIdx = src.lastIndexOf('/');
  const imageIdentifierAndField = src.slice(0, lastSeparatorIdx);

  urlParams.push(imageIdentifierAndField);

  if(width){
    const size = (width > MAX_WIDTH_SIZE) ? MAX_WIDTH_SIZE : width;
    urlParams.push(size + 'w');
  }

  urlParams.push(quality + 'q');

  return urlParams.join('/');
}

export default DotCmsImage
