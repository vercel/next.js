import Link from 'next/link'
import { PrismicText } from '@prismicio/react'
import { asText } from '@prismicio/helpers'
import Avatar from '../components/avatar'
import Date from '../components/date'
import CoverImage from './cover-image'

/**
 * @param {object} props
 * @param {import("@prismicio/types").TitleField} props.title
 * @param {import('@prismicio/types').ImageField} props.coverImage
 * @param {string} props.date
 * @param {import("../types.generated").AuthorDocument} props.author
 * @param {string} props.href
 */
export default function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
  href,
}) {
  return (
    <div>
      <div className="mb-5">
        <CoverImage title={asText(title)} href={href} image={coverImage} />
      </div>
      <h3 className="text-3xl mb-3 leading-snug">
        <Link href={href}>
          <a className="hover:underline">
            <PrismicText field={title} />
          </a>
        </Link>
      </h3>
      <div className="text-lg mb-4">
        <Date dateString={date} />
      </div>
      <p className="text-lg leading-relaxed mb-4">{excerpt}</p>
      <Avatar name={asText(author.data.name)} picture={author.data.picture} />
    </div>
  )
}
