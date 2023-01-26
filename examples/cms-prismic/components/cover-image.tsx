import Link from 'next/link'
import { PrismicNextImage } from '@prismicio/next'
import { ImageField } from '@prismicio/types'
import cn from 'classnames'

type CoverImageProps = {
  title: string
  image: ImageField
  href?: string
}

export default function CoverImage({
  title,
  image: imageField,
  href,
}: CoverImageProps) {
  const image = (
    <PrismicNextImage
      field={imageField}
      width={2000}
      height={1000}
      imgixParams={{ fit: 'crop', ar: '2:1' }}
      className={cn('shadow-small', {
        'hover:shadow-medium transition-shadow duration-200': href,
      })}
    />
  )

  return (
    <div className="sm:mx-0">
      {href ? (
        <Link href={href} aria-label={title}>
          {image}
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
