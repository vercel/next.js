import Link from 'next/link'
import { PrismicText } from '@prismicio/react'
import { asText } from '@prismicio/helpers'
import Avatar from '../components/avatar'
import Date from '../components/date'
import CoverImage from '../components/cover-image'

/**
 * @param {object} props
 * @param {import("@prismicio/types").TitleField} props.title
 * @param {import("@prismicio/types").ImageField} props.coverImage
 * @param {string} props.date
 * @param {string} props.excerpt
 * @param {import('../types.generated').AuthorDocument} props.author
 * @param {string} props.href
 */
export default function HeroPost({
  title,
  coverImage,
  date,
  excerpt,
  author,
  href,
}) {
  return (
    <section>
      <div className="mb-8 md:mb-16">
        <CoverImage title={asText(title)} href={href} image={coverImage} />
      </div>
      <div className="md:grid md:grid-cols-2 md:gap-x-16 lg:gap-x-8 mb-20 md:mb-28">
        <div>
          <h3 className="mb-4 text-4xl lg:text-6xl leading-tight">
            <Link href={href}>
              <a className="hover:underline">
                <PrismicText field={title} />
              </a>
            </Link>
          </h3>
          <div className="mb-4 md:mb-0 text-lg">
            <Date dateString={date} />
          </div>
        </div>
        <div>
          <p className="text-lg leading-relaxed mb-4">{excerpt}</p>
          {author && (
            <Avatar
              name={asText(author.data.name)}
              picture={author.data.picture}
            />
          )}
        </div>
      </div>
    </section>
  )
}
