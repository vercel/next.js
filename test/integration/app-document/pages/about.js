import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div className="page-about">about</div>
      <Link href="/">
        <a id="home-link">home</a>
      </Link>
    </div>
  )
}
