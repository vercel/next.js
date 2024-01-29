import NextImage, { ImageLoaderProps } from "next/image";
import { transformImageUrl } from "@kontent-ai/delivery-sdk";

const srcIsKontentAsset = (src: string) => {
  try {
    const { hostname } = new URL(src);
    return hostname.endsWith(".kc-usercontent.com");
  } catch {
    return false;
  }
};

const kontentImageLoader = ({
  src,
  width,
  quality = 75,
}: ImageLoaderProps): string => {
  return transformImageUrl(src)
    .withWidth(width)
    .withQuality(quality)
    .withCompression("lossless")
    .withAutomaticFormat()
    .getUrl();
};

const getLoader = (src: string) => {
  return srcIsKontentAsset(src) ? kontentImageLoader : undefined;
};

type ImageType = {
  width?: number;
  height?: number;
  src: string;
  layout?: string;
  className: string;
  alt: string;
};

export default function Image(props: ImageType) {
  const loader = getLoader(props.src);

  return <NextImage {...props} loader={loader} />;
}
