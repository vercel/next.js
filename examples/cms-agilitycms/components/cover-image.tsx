import Image from "../lib/components/image";
import cn from "classnames";
import Link from "next/link";

export default function CoverImage({ title, responsiveImage, slug = null }) {
  const image = (
    <Image
      data={{
        ...responsiveImage,
      }}
      className={cn("shadow-small", {
        "hover:shadow-medium transition-shadow duration-200": slug,
      })}
    />
  );
  return (
    <div className="sm:mx-0">
      {slug ? (
        <Link href={`/posts/${slug}`} aria-label={title}>
          {image}
        </Link>
      ) : (
        image
      )}
    </div>
  );
}
