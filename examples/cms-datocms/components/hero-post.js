import textStyles from '../components/text-styles.module.css'
import cn from 'classnames'
import Avatar from '../components/avatar'
import Date from '../components/date'
import CoverImage from '../components/cover-image'

export default function HeroPost({ title, coverImage, date, excerpt, author }) {
  return (
    <section>
      <div className="mb-8 md:mb-16">
        <CoverImage
          title={title}
          responsiveImage={coverImage.responsiveImage}
        />
      </div>
      <div className="md:grid md:grid-cols-2 md:col-gap-16 lg:col-gap-8 mb-20 md:mb-28">
        <div>
          <h3 className="mb-4 text-4xl lg:text-6xl leading-tight">{title}</h3>
          <div className="mb-4 md:mb-0">
            <Date dateString={date} />
          </div>
        </div>
        <div>
          <p className={cn(textStyles['body-text'], 'mb-4')}>{excerpt}</p>
          <Avatar name={author.name} picture={author.picture} />
        </div>
      </div>
    </section>
  )
}
