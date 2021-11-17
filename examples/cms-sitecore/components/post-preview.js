import Avatar from '../components/avatar'
import CoverImage from './cover-image'
import DateComponent from '../components/date'
import Link from 'next/link'

export default function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
  id,  
}) {
  return (
    <div>
      <div className="mb-5">
        <CoverImage title={title} id={id} url={coverImage.url} />
      </div>
      <h3 className="text-3xl mb-3 leading-snug">
        <Link href={`/posts/${id}`}>
          <a className="hover:underline">{title}</a>
        </Link>
      </h3>
      <div className="text-lg mb-4">
        <DateComponent dateString={date} />
      </div>
      <div className="text-lg leading-relaxed mb-4">
        <div dangerouslySetInnerHTML={{ __html: excerpt }}></div>
      </div>
      {author && <Avatar name={author.name} picture={author.picture} />}
    </div>
  )
}
