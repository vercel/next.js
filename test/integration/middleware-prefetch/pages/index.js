import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <p>Home Page</p>
      <div />
      <Link href="/made-up">
        <a id="made-up-link">Madeup Page</a>
      </Link>
      <div />
      <Link href="/ssg-page-2">
        <a id="ssg-page-2">SSG Page 2 (Redirect)</a>
      </Link>
      <div />
    </div>
  )
}
