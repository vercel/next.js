import Avatar from "./avatar";
import Date from "./date";
import CoverImage from "./cover-image";
import Link from "next/link";
import Author from "../types/author";
import Picture from "../types/picture";

type Props = {
  title: string;
  coverImage: Picture;
  date: string;
  excerpt: string;
  author: Author;
  slug: string;
};

export default function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}: Props) {
  return (
    <div>
      <div className="mb-5">
        {coverImage && (
          <CoverImage title={title} coverImage={coverImage} slug={slug} />
        )}
      </div>
      <h3 className="text-3xl mb-3 leading-snug">
        <Link href={`/posts${slug}`} className="hover:underline">
          {title}
        </Link>
      </h3>
      <div className="text-lg mb-4">
        <Date dateString={date} />
      </div>
      <div
        className="text-lg leading-relaxed mb-4"
        dangerouslySetInnerHTML={{ __html: excerpt }}
      />
      <Avatar author={author} />
    </div>
  );
}
