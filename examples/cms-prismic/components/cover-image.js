import Link from 'next/link'
import cn from 'classnames'
import { PrismicNextImage } from '@prismicio/next'

/**
 * @param {object} props
 * @param {string} props.title
 * @param {import("@prismicio/types").ImageField} props.image
 * @param {string} [props.href]
 */
export default function CoverImage({ title, image: imageField, href }) {
  const image = (
    <PrismicNextImage
      field={imageField}
      width={2000}
      height={1000}
      alt={`Cover Image for ${title}`}
      className={cn('shadow-small', {
        'hover:shadow-medium transition-shadow duration-200': href,
      })}
    />
  )

  return (
    <div className="sm:mx-0">
      {href ? (
        <Link href={href}>
          <a aria-label={title}>{image}</a>
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
