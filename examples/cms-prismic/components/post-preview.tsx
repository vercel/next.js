import Link from 'next/link'
import { DateField, ImageField, TitleField } from '@prismicio/types'
import { PrismicText } from '@prismicio/react'
import { asText, isFilled } from '@prismicio/helpers'

import { AuthorContentRelationshipField } from '../lib/types'

import Avatar from '../components/avatar'
import Date from '../components/date'

import CoverImage from './cover-image'

type PostPreviewProps = {
  title: TitleField
  coverImage: ImageField
  date: DateField
  excerpt: string
  author: AuthorContentRelationshipField
  href: string
}

export default function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
  href,
}: PostPreviewProps) {
  return (
    <div>
      <div className="mb-5">
        <CoverImage title={asText(title)} href={href} image={coverImage} />
      </div>
      <h3 className="text-3xl mb-3 leading-snug">
        <Link href={href} className="hover:underline">
          <PrismicText field={title} />
        </Link>
      </h3>
      <div className="text-lg mb-4">
        <Date dateField={date} />
      </div>
      <p className="text-lg leading-relaxed mb-4">{excerpt}</p>
      {isFilled.contentRelationship(author) && (
        <Avatar name={asText(author.data.name)} picture={author.data.picture} />
      )}
    </div>
  )
}
