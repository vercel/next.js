import Link from 'next/link'

export default function Page(props) {
  return (
    <Link href="/pages-linking">
      <a id="pages-link">To App Page</a>
    </Link>
  )
}
