import Image from 'next/image'
import Link from 'next/link'
import cn from 'classnames'

export default function CoverImage({ title, url, id }) {
  const image = (
    <Image
      width={2000}
      height={1000}
      alt={`Cover Image for ${title}`}
      className="object-cover"
      src={url}
    />
  )

  return (
    <div className="sm:mx-0">
      {id ? (
        <Link href={`/posts/${id}`}>
          <a aria-label={title}>{image}</a>
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
