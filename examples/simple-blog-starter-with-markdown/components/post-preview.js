import DateFormater from '../components/date-formater'
import Link from 'next/link'

export default function PostPreview({
  title,
  date,
  excerpt,
  slug,
}) {
  return (
    <div className='flex flex-row items-start py-6 post-preview'>
      <div className="text-lg mt-1 mr-12 opacity-50">
        <DateFormater dateString={date} strFormat='d/MM' />
      </div>
      <div className='flex flex-col'>
      <h3 className="text-xl md:text-3xl leading-tight font-semibold mb-4">
        <Link as={`/posts/${slug}`} href="/posts/[slug]">
          <a className="hover:opacity-50">{title}</a>
        </Link>
      </h3>
      <p className="text-lg leading-relaxed mb-4 opacity-75">{excerpt}</p>
      </div>
    </div>
  )
}
