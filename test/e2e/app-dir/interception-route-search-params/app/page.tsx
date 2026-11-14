import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/items" id="to-items">
          /items
        </Link>
      </li>
      <li>
        <Link href="/prefetch?tab=all" id="to-prefetch">
          /prefetch?tab=all
        </Link>
      </li>
    </ul>
  )
}
