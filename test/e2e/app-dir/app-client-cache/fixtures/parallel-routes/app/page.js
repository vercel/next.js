import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/0" prefetch={true}>
        To Dynamic Page
      </Link>
    </div>
  )
}
