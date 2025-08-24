import Avatar from "./avatar";
import DateFormatter from "./date-formatter";
import CoverImage from "./cover-image";
import PostTitle from "./post-title";
import { Author } from "@/viewmodels/author";

type PostHeaderType = {
  title: string;
  coverImage: string;
  date: string | null;
  author: Author;
};

export default function PostHeader({
  title,
  coverImage,
  date,
  author,
}: PostHeaderType) {
  return (
    <>
      <PostTitle title={title} />
      <div className="hidden md:block md:mb-12">
        <Avatar name={author.name} picture={author.picture} />
      </div>
      <div className="mb-8 md:mb-16 -mx-5 sm:mx-0">
        <CoverImage title={title} src={coverImage} />
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="block md:hidden mb-6">
          <Avatar name={author.name} picture={author.picture} />
        </div>
        <div className="mb-6 text-lg">
          <DateFormatter dateString={date} />
        </div>
      </div>
    </>
  );
}
