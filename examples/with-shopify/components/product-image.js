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
      className="absolute w-full h-full"
    />
  )

  return (
    <div
      className={cn(
        containerClassName,
        'relative overflow-hidden pb-full shadow-small',
        {
          'hover:shadow-medium transition-shadow duration-200': slug,
        }
      )}
    >
      {slug ? (
        <Link as={`/p/${slug}`} href="/p/[slug]">
          <a aria-label={title}>{img}</a>
        </Link>
      ) : (
        img
      )}

      {children}
    </div>
  )
}
