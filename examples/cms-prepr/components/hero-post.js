import Avatar from './avatar'
import Date from './date'
import CoverImage from './cover-image'
import Badge from './badge'
import ReadTime from './read-time'
import Link from 'next/link'

export default function HeroPost({
  title,
  coverImage,
  date,
  excerpt,
  author,
  categories,
  readTime,
  slug,
}) {
  return (
    <section>
      <div className="mb-8 md:mb-16">
        <CoverImage title={title} url={coverImage} slug={slug} priority />
      </div>
      <div className="mb-20 md:mb-28 md:grid md:grid-cols-2 md:gap-x-16 lg:gap-x-8">
        <div>
          {categories?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {categories.map((c, i) => (
                <Badge key={i}>{c.name}</Badge>
              ))}
            </div>
          )}
          <h3 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-secondary-700 lg:text-5xl">
            <Link href={`/posts/${slug}`} className="hover:text-primary-600">
              {title}
            </Link>
          </h3>
          {date && (
            <div className="mb-4 text-lg text-secondary-500 md:mb-0">
              <Date dateString={date} />
            </div>
          )}
        </div>
        <div>
          <div
            className="mb-4 text-lg leading-relaxed text-secondary-600"
            dangerouslySetInnerHTML={{ __html: excerpt }}
          ></div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {author && (
              <Avatar name={author.name} picture={author.image?.url} />
            )}
            <ReadTime minutes={readTime} />
          </div>
        </div>
      </div>
    </section>
  )
}
