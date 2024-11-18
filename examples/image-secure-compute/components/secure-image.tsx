import Image, { ImageProps } from "next/image";

export function SecureImage(props: ImageProps) {
  const src =
    typeof props.src === "string" ? `/image-api${props.src}` : props.src;
  return <Image {...props} src={src} />;
}
