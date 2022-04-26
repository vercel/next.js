import Avatar from '../components/avatar'
import DateComponent from '../components/date'
import CoverImage from '../components/cover-image'
import PostTitle from '../components/post-title'
import cn from "classnames";

export default function PostHeader({ title, coverImage, author, slug }) {
  return (
    <>
      <PostTitle>{title}</PostTitle>
      <div className='hidden md:block md:mb-12'>
        {author.length ? <Avatar name={`${author[0].firstName} ${author[0].lastName}`} picture={author[0].profilePhoto} /> : null}
      </div>
      <div className='mb-8 md:mb-16 sm:mx-0'>
        <CoverImage
          title={title}
          width={2000}
          height={1000}
          src={coverImage.idPath}
          objectFit="cover"
          layout={'intrinsic'}
         />
      </div>
    </>
  )
}
