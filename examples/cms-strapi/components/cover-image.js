import Image from 'next/image'
import Link from 'next/link'
import { getStrapiMedia } from '../lib/media'

export default function CoverImage({ title, image, slug }) {
  const fullUrl = getStrapiMedia(image)

  return (
    <div className="sm:mx-0">
      {slug ? (
        <Link as={`/posts/${slug}`} href="/posts/[slug]">
          <a aria-label={title}>
            <Image
              src={fullUrl}
              layout="responsive"
              objectFit="contain"
              width={image.width}
              height={image.height}
              alt={`Cover Image for ${title}`}
            />
          </a>
        </Link>
      ) : (
        <img src={fullUrl} alt={title} />
      )}
    </div>
  )
}
