import Link from "next/link";
import Avatar from "@components/avatar";
import DateComponent from "@components/date";
import CoverImage from "@components/cover-image";
import cn from "classnames";

export default function HeroPost({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}) {
  return (
    <section>
      <div className="mb-8 md:mb-16">
        <CoverImage
          width={2000}
          height={1000}
          title={title}
          slug={slug}
          objectFit="cover"
          layout={"intrinsic"}
          src={coverImage.idPath}
          alt={`Cover Image for ${title}`}
          className={cn("shadow-small", {
            "hover:shadow-medium transition-shadow duration-200": slug,
          })}
        />
      </div>
      <div className="md:grid md:grid-cols-2 md:gap-16 lg:col-gap-8  mb-20 md:mb-28">
        <div>
          <h3 className="mb-4 text-4xl leading-tight lg:text-6xl">
            <Link
              as={`/posts/${slug}`}
              href="/posts/[slug]"
              className="hover:underline"
            >
              {title}
            </Link>
          </h3>
          <div className="mb-4 text-lg md:mb-0">
            <DateComponent dateString={date} />
          </div>
        </div>
        <div>
          <p className="mb-4 text-lg leading-relaxed">{excerpt}</p>
          {author.length ? (
            <Avatar
              name={`${author[0].firstName} ${author[0].lastName}`}
              picture={author[0].profilePhoto}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
