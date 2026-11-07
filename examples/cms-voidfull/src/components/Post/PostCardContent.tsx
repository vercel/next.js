import { useMemo } from "react";
import { type OnlyRequired, cn } from "@codecarrot/essentials";
import dayjs from "dayjs";
import type { Post } from "@voidfull/js-sdk";

type RequiredProps = "id" | "title" | "slug" | "excerpt" | "publishedAt";

interface Props extends OnlyRequired<Post, RequiredProps> {
  firstPost?: boolean;
}

export const PostCardContent = ({
  id,
  firstPost = false,
  title,
  slug,
  excerpt,
  publishedAt,
}: Props) => {
  const date = useMemo(() => {
    return publishedAt ? dayjs(publishedAt).format("MMM DD, YYYY") : null;
  }, [publishedAt]);

  return (
    <div>
      <a href={`/p/${id}-${slug}`}>
        <h3
          className={cn(
            "font-semibold break-words",
            firstPost ? "text-2xl lg:text-4xl" : "text-2xl lg:text-3xl",
          )}
        >
          {title}
        </h3>
      </a>

      {excerpt ? (
        <p className="mt-4 break-words line-clamp-2 text-gray-600">{excerpt}</p>
      ) : null}

      {date ? (
        <footer className="mt-2">
          <time className="text-gray-600 text-sm" dateTime={date}>
            {date}
          </time>
        </footer>
      ) : null}
    </div>
  );
};
