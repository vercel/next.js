import cn from "classnames";
import Link from "next/link";
import Imgix from "react-imgix";

type CoverImageProps = {
  title;
  url;
  slug;
};
const CoverImage = (props: CoverImageProps) => {
  const { title, url, slug } = props;

  const image = (
    <Imgix
      src={url}
      alt={`Cover Image for ${title}`}
      className={cn("lazyload shadow-small w-full", {
        "hover:shadow-medium transition-shadow duration-200": slug,
      })}
      sizes="100vw"
      attributeConfig={{
        src: "data-src",
        srcSet: "data-srcset",
        sizes: "data-sizes",
      }}
      htmlAttributes={{
        src: `${url}?auto=format,compress&q=1&blur=500&w=auto`,
      }}
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
