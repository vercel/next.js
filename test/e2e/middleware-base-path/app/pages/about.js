import Link from 'next/link'

export default function About() {
  return (
    <div>
      <h1 className="title">About Page</h1>
      <Link href="/">
        <a id="index-anchor">Index</a>
      </Link>
    </div>
  )
}
