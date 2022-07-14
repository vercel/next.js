import Link from 'next/link'
export default function Page(props) {
  return (
    <>
      <p>hello from pages/index</p>
      <Link href="/dashboard">Dashboard</Link>
    </>
  )
}
