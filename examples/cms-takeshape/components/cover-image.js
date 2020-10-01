import cn from 'classnames'
import Link from 'next/link'
import { getImageUrl } from 'takeshape-routing'

export default function CoverImage({ title, coverImage, slug }) {
  const image = (
    <img
      src={getImageUrl(coverImage.path, {
        fm: 'jpg',
        fit: 'crop',
        w: 2000,
        h: 1000,
      })}
      className={cn('shadow-small', {
        'hover:shadow-medium transition-shadow duration-200': slug,
      })}
    />
  )
  return (
    <div className="sm:mx-0">
      {slug ? (
        <Link as={`/posts/${slug}`} href="/posts/[slug]">
          <a aria-label={title}>{image}</a>
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
