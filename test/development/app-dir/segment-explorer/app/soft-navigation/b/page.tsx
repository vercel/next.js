import Link from 'next/link'

export default function SoftNavigationBPage() {
  return (
    <>
      <p>Page B</p>
      <Link href="/soft-navigation/a">Go to Page a</Link>
    </>
  )
}
