import Link from 'next/link'
import Avatar from '@components/avatar'
import DateComponent from '@components/date'
import CoverImage from './cover-image'

export default function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}) {
  return (
    <div>
      <div className="mb-5">
        <CoverImage
          width={1200}
          height={600}
          title={title}
          slug={slug}
          src={coverImage.idPath}
          objectFit="cover"
          layout={'intrinsic'}
        />
      </div>
      <h3 className="mb-3 text-3xl leading-snug">
        <Link href={`/posts/${slug}`} className="hover:underline">
          {title}
        </Link>
      </h3>
      {date !== 'now' ? (
        <div className="mb-4 text-lg">
          <DateComponent dateString={date} />
        </div>
      ) : null}
      <p className="mb-4 text-lg leading-relaxed">{excerpt}</p>
      {author.length ? (
        <Avatar
          name={`${author[0].firstName} ${author[0].lastName}`}
          picture={author[0].profilePhoto}
        />
      ) : null}
    </div>
  )
}
