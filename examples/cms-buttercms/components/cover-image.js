import Link from 'next/link'

export default function CoverImage({ title, url, slug }) {
  return (
    <div className="sm:mx-0">
      {slug ? (
        <Link as={`/posts/${slug}`} href="/posts/[slug]">
          <a aria-label={title}>
            <img src={url} alt={title} />
          </a>
        </Link>
      ) : (
        <img src={url} alt={title} />
      )}
    </div>
  )
}
