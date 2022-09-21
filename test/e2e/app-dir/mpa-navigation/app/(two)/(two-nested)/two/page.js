import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/two/inner">To two inner</Link>
      <p id="two">Two</p>
    </>
  )
}
