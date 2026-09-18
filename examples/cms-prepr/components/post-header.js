import Avatar from './avatar'
import Date from './date'
import CoverImage from './cover-image'
import PostTitle from './post-title'
import Badge from './badge'
import ReadTime from './read-time'

export default function PostHeader({
  title,
  coverImage,
  date,
  author,
  categories,
  readTime,
}) {
  return (
    <>
      {categories?.length > 0 && (
        <div className="mb-6 flex flex-wrap justify-center gap-2 md:justify-start">
          {categories.map((c, i) => (
            <Badge key={i}>{c.name}</Badge>
          ))}
        </div>
      )}
      <PostTitle>{title}</PostTitle>
      <div className="mb-8 sm:mx-0 md:mb-16">
        <CoverImage title={title} url={coverImage} />
      </div>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          {author && <Avatar name={author.name} picture={author.image?.url} />}
          <div className="flex items-center gap-4 text-lg text-secondary-500">
            {date && <Date dateString={date} />}
            <ReadTime minutes={readTime} />
          </div>
        </div>
      </div>
    </>
  )
}
