import { PrismicNextImage } from "@prismicio/next";
import { SliceComponentProps } from "@prismicio/react";
import { Content } from "@prismicio/client";

type ImageProps = SliceComponentProps<Content.ImageSlice>;

const Image = ({ slice }: ImageProps) => {
  return (
    <section className="my-12">
      <PrismicNextImage field={slice.primary.image} layout="responsive" />
    </section>
  );
};

export default Image;
