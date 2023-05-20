import Avatar from './avatar'
import Date from './date'
import CoverImage from './cover-image'
import PostTitle from './post-title'
import { AuthorType, ImgixType } from 'interfaces'

type PostHeaderProps = {
  title: string
  coverImage: ImgixType
  date: string
  author: AuthorType
}

const PostHeader = (props: PostHeaderProps) => {
  const { title, coverImage, date, author } = props
  return (
    <>
      <PostTitle>{title}</PostTitle>
      <div className="hidden md:block md:mb-12">
        <Avatar
          name={author.title}
          picture={author.metadata.picture.imgix_url}
        />
      </div>
      <div className="mb-8 md:mb-16 sm:mx-0">
        <CoverImage title={title} url={coverImage.imgix_url} slug={''} />
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="block md:hidden mb-6">
          <Avatar
            name={author.title}
            picture={author.metadata.picture.imgix_url}
          />
        </div>
        <div className="mb-6 text-lg">
          <Date dateString={date} />
        </div>
      </div>
    </>
  )
}

export default PostHeader
