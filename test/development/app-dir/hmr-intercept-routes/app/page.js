import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1>Main Page</h1>
      <Link id="to-intercept" href="/intercept">
        Goto Intercept
      </Link>
    </div>
  )
}
