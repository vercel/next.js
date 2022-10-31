import cn from 'classnames'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from 'takeshape-routing'

export default function CoverImage({ title, coverImage, slug }) {
  const image = (
    <Image
      width={2000}
      height={1000}
      alt={`Cover Image for ${title}`}
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
        <Link href={slug} aria-label={title}>
          {image}
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
