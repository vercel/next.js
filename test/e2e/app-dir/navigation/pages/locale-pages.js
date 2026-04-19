import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/about" locale="en">
        Link 1
      </Link>
      <Link href="/about" locale="fr">
        Link 2
      </Link>
    </>
  )
}
