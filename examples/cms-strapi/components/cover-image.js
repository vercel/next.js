import Link from 'next/link'

export default function CoverImage({ title, url, slug }) {
  return (
    <div className="-mx-5 sm:mx-0">
      {slug ? (
        <Link as={`/posts/${slug}`} href="/posts/[slug]">
          <a aria-label={title}>
            <img src={`${process.env.NEXT_PUBLIC_API_URL}${url}`} alt={title} />
          </a>
        </Link>
      ) : (
        <img src={`${process.env.NEXT_PUBLIC_API_URL}${url}`} alt={title} />
      )}
    </div>
  )
}
