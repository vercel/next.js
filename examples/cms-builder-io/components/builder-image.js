import Image from "next/image";

const builderLoader = ({ src, width, quality }) => {
  return `${src}?width=${width}&quality=${quality || 75}`;
};

const BuilderImage = (props) => {
  return <Image loader={builderLoader} {...props} />;
};

export default BuilderImage;
