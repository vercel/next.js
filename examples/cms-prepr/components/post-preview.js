import Avatar from './avatar'
import CoverImage from './cover-image'
import Badge from './badge'
import ReadTime from './read-time'
import Link from 'next/link'

export default function PostPreview({
  title,
  coverImage,
  excerpt,
  author,
  categories,
  readTime,
  slug,
}) {
  return (
    <Link
      href={`/posts/${slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border-2 border-transparent bg-white p-2 transition duration-200 hover:border-primary-600"
    >
      <div className="relative">
        <CoverImage title={title} url={coverImage} />
        {categories?.length > 0 && (
          <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2">
            {categories.map((c, i) => (
              <Badge key={i}>{c.name}</Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex grow flex-col gap-3 p-2 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {author && <Avatar name={author.name} picture={author.image?.url} />}
          <ReadTime minutes={readTime} />
        </div>
        <h3 className="text-2xl font-semibold leading-snug text-secondary-700 group-hover:text-primary-600">
          {title}
        </h3>
        <div
          className="text-base leading-relaxed text-secondary-600"
          dangerouslySetInnerHTML={{ __html: excerpt }}
        ></div>
      </div>
    </Link>
  )
}
