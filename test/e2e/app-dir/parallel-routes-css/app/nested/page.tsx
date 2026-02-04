import Link from 'next/link'

export const metadata = {
  title: 'Nested Page',
}

export default function Page() {
  return (
    <div className="sub">
      <p>Sub</p>
      <Link href="/">Home</Link>
    </div>
  )
}
