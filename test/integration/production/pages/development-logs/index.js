import Link from 'next/link'

export default function IndexPage () {
  return (
    <div>
      <Link href='/about' prefetch>
        <a>To About Page</a>
      </Link>
    </div>
  )
}
