import cn from 'classnames'
import Link from 'next/link'
import Imgix from 'react-imgix'

export default function CoverImage({ title, url, slug }) {
  const image = (
    <Imgix
      src={url}
      alt={`Cover Image for ${title}`}
      className={cn('lazyload shadow-small', {
        'hover:shadow-medium transition-shadow duration-200': slug,
      })}
      sizes="100vw"
      attributeConfig={{
        src: 'data-src',
        srcSet: 'data-srcset',
        sizes: 'data-sizes',
      }}
      htmlAttributes={{
        src: `${url}?auto=format,compress&q=1&blur=500&w=auto`,
      }}
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
