import Link from 'next/link'

export default function IndexPage() {
  return (
    <div>
      <Link href="/about" prefetch>
        To About Page
      </Link>
    </div>
  )
}
