import { type OnlyRequired, cn } from "@codecarrot/essentials";
import type { Post } from "@voidfull/js-sdk";

type RequiredProps = "id" | "title" | "slug" | "featureImage";

export const PostCardImage = ({
  id,
  title,
  slug,
  featureImage,
}: OnlyRequired<Post, RequiredProps>) => {
  if (!featureImage) return null;

  return (
    <a
      href={`/p/${id}-${slug}`}
      className={cn(
        "w-full aspect-[2.25/1] relative border border-black border-opacity-10 rounded-xl overflow-hidden",
      )}
    >
      <img
        className="absolute inset-0 object-cover bg-gray-100 w-full h-full min-h-full"
        srcSet={[featureImage ? `${featureImage} 600w` : ""].toString()}
        src={featureImage}
        alt={title}
        loading="lazy"
      />
    </a>
  );
};
