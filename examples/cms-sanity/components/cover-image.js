import cn from 'classnames'
import Image from 'next/image'
import Link from 'next/link'
import { urlForImage } from '../lib/sanity'

export default function CoverImage({ title, slug, image: source }) {
  const image = source ? (
    <Image
      width={2000}
      height={1000}
      alt={`Cover Image for ${title}`}
      src={urlForImage(source).height(1000).width(2000).url()}
      className={cn('shadow-small', {
        'hover:shadow-medium transition-shadow duration-200': slug,
      })}
    />
  ) : (
    <div style={{ paddingTop: '50%', backgroundColor: '#ddd' }} />
  )

  return (
    <div className="sm:mx-0">
      {slug ? (
        <Link href={`/posts/${slug}`}>
          <a aria-label={title}>{image}</a>
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
