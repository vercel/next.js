import Link from 'next/link'
import cn from 'classnames'

export default function ProductImage({
  containerClassName,
  image,
  title,
  slug,
  children,
}) {
  const img = (
    <img
      src={image.transformedSrc || image.originalSrc}
      alt={image.altText || `Product image for ${title}`}
      className="w-full h-full"
    />
  )

  return (
    <div className="w-full">
      <div
        className={cn(
          containerClassName,
          'relative overflow-hidden shadow-small max-h-104',
          { 'hover:shadow-medium transition-shadow duration-200': slug }
        )}
      >
        {slug ? (
          <Link as={`/posts/${slug}`} href="/posts/[slug]">
            <a aria-label={title}>{img}</a>
          </Link>
        ) : (
          img
        )}

        {children}
      </div>
    </div>
  )
}
