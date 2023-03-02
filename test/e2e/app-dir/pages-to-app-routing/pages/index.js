import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <Link id="home-to-about" href="/about">
        About
      </Link>
    </div>
  )
}
