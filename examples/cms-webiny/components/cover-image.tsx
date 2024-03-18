import cn from "classnames";
import Link from "next/link";
import Image from "next/image";

export type TCoverImage = {
  title: string;
  src: string;
  slug?: string;
  height: number;
  width: number;
};

const CoverImage: React.FC<TCoverImage> = ({
  title,
  src,
  slug,
  height,
  width,
}) => {
  const image = (
    <Image
      src={src}
      alt={`Cover Image for ${title}`}
      className={cn("shadow-sm", {
        "hover:shadow-md transition-shadow duration-200": slug,
      })}
      layout="responsive"
      width={width}
      height={height}
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
};
export default CoverImage;
