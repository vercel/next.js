import Link from 'next/link'
import Avatar from '../components/avatar'
import Date from '../components/date'
import CoverImage from '../components/cover-image'

export default function HeroPost({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}) {
  return (
    <section>
      <div className="mb-8 md:mb-16">
        <CoverImage
          title={title}
          responsiveImage={coverImage.responsiveImage}
          slug={slug}
        />
      </div>
      <div className="md:grid md:grid-cols-2 md:col-gap-16 lg:col-gap-8 mb-20 md:mb-28">
        <div>
          <h3 className="mb-4 text-4xl lg:text-6xl leading-tight">
            <Link href={`/posts/${slug}`}>
              <a className="hover:underline">{title}</a>
            </Link>
          </h3>
          <div className="mb-4 md:mb-0 text-lg">
            <Date dateString={date} />
          </div>
        </div>
        {author && (
          <div>
            <p className="text-lg leading-relaxed mb-4">{excerpt}</p>
            <Avatar name={author.name} picture={author.picture} />
          </div>
        )}
      </div>
    </section>
  )
}

// The data returned here will be send as `props` to the component
HeroPost.getCustomInitialProps = async function ({ client }) {
  const post = await client.getLatestPost()
  return post
}
