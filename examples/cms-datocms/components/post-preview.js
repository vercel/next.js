import textStyles from '../components/text-styles.module.css'
import Avatar from '../components/avatar'
import Date from '../components/date'
import CoverImage from './cover-image'
import cn from 'classnames'

export default function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
}) {
  return (
    <div>
      <div className="mb-5">
        <CoverImage
          title={title}
          responsiveImage={coverImage.responsiveImage}
        />
      </div>
      <h3 className="text-3xl mb-3 leading-snug">{title}</h3>
      <div className="text-lg mb-4 text-accent-5">
        <Date dateString={date} />
      </div>
      <p className={cn(textStyles['body-text'], 'mb-4')}>{excerpt}</p>
      <Avatar name={author.name} picture={author.picture} />
    </div>
  )
}
