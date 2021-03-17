import Link from 'next/link'

export default function CoverImage({ title, url, slug }) {
  const imageUrl = `${
    url.startsWith('/') ? process.env.NEXT_PUBLIC_STRAPI_API_URL : ''
  }${url}`
  return (
    <div className="sm:mx-0">
      {slug ? (
        <Link as={`/posts/${slug}`} href="/posts/[slug]">
          <a aria-label={title}>
            <img src={imageUrl} alt={title} />
          </a>
        </Link>
      ) : (
        <img src={imageUrl} alt={title} />
      )}
    </div>
  )
}
