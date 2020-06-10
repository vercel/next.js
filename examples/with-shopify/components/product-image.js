import cn from 'classnames'
import Link from 'next/link'

export default function ProductImage({ image, title, slug }) {
  const img = (
    <div
      className={cn('shadow-small max-h-104', {
        'hover:shadow-medium transition-shadow duration-200': slug,
      })}
    >
      <img
        src={image.transformedSrc || image.originalSrc}
        alt={image.altText || `Product image for ${title}`}
        className="w-full h-full"
      />
    </div>
  )

  return (
    <div className="w-full">
      {slug ? (
        <Link as={`/posts/${slug}`} href="/posts/[slug]">
          <a aria-label={title}>{img}</a>
        </Link>
      ) : (
        img
      )}
    </div>
  )
}
