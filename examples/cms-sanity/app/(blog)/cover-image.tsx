import { urlForImage } from "@/sanity/lib/utils";
import * as motion from "framer-motion/client";
import { Image } from "next-sanity/image";

interface CoverImageProps {
  image: any;
  priority?: boolean;
}

export default function CoverImage(props: CoverImageProps) {
  const { image: source, priority } = props;
  const image = source?.asset?._ref ? (
    <Image
      className="h-auto w-full"
      width={2000}
      height={1000}
      alt={source?.alt || ""}
      src={urlForImage(source)?.height(1000).width(2000).url() as string}
      sizes="100vw"
      priority={priority}
    />
  ) : (
    <div className="bg-slate-50" style={{ paddingTop: "50%" }} />
  );

  return (
    <motion.div
      layout
      className="shadow-md transition-shadow duration-200 group-hover:shadow-lg sm:mx-0"
    >
      {image}
    </motion.div>
  );
}
