import Link from 'next/link'

export default function SoftNavigationAPage() {
  return (
    <>
      <p>Page A</p>
      <Link href="/soft-navigation/b">Go to Page b</Link>
    </>
  )
}
