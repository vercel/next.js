import Link from 'next/link'

export default function ToMissingLinkPage() {
  return (
    <Link href="/missing">
      <a id="to-missing">to 404</a>
    </Link>
  )
}
