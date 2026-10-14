import Image from 'next/image'
import Link from 'next/link'

export default function CoverImage({ title, url, slug, priority = false }) {
  const image = (
    <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl shadow-sm transition-shadow duration-200 hover:shadow-md">
      <Image
        fill
        sizes="(max-width: 768px) 100vw, 768px"
        alt={`Cover image for ${title}`}
        src={url}
        className="object-cover"
        priority={priority}
      />
    </div>
  )
  return (
    <div className="sm:mx-0">
      {slug ? (
        <Link href={`/posts/${slug}`} aria-label={title}>
          {image}
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
