import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <p>This is the Homepage</p>
      <Link id="some-route-link" href="/some-route">
        Static route
      </Link>
      <Link id="dynamic-route-link" href="/sub/100">
        Dynamic sub route
      </Link>
    </div>
  )
}
