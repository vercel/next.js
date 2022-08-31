import { PrismicText } from '@prismicio/react'
import { asText } from '@prismicio/helpers'
import Avatar from '../components/avatar'
import Date from '../components/date'
import CoverImage from '../components/cover-image'
import PostTitle from '../components/post-title'

/**
 * @param {object} props
 * @param {import("@prismicio/types").TitleField} props.title
 * @param {import('@prismicio/types').ImageField} props.coverImage
 * @param {string} props.date
 * @param {import("../types.generated").AuthorDocument} props.author
 */
export default function PostHeader({ title, coverImage, date, author }) {
  return (
    <>
      <PostTitle>
        <PrismicText field={title} />
      </PostTitle>
      <div className="hidden md:block md:mb-12">
        {author && (
          <Avatar
            name={asText(author.data.name)}
            picture={author.data.picture}
          />
        )}
      </div>
      <div className="mb-8 md:mb-16 sm:mx-0">
        <CoverImage title={asText(title)} image={coverImage} />
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="block md:hidden mb-6">
          {author && (
            <Avatar
              name={asText(author.data.name)}
              picture={author.data.picture}
            />
          )}
        </div>
        <div className="mb-6 text-lg">
          <Date dateString={date} />
        </div>
      </div>
    </>
  )
}
