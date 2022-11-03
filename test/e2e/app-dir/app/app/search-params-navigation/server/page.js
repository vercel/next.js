import Link from 'next/link'

export default function Page({ searchParams }) {
  return (
    <nav data-param-page={searchParams.page}>
      <Link id="link-1" href="/search-params-navigation?page=1">
        Page 1
      </Link>
      <Link id="link-2" href="/search-params-navigation?page=2">
        Page 2
      </Link>
    </nav>
  )
}
