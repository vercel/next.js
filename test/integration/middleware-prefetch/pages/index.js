import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <p>Home Page</p>
      <div />
      <Link href="/made-up" id="made-up-link">
        Madeup Page
      </Link>
      <div />
      <Link href="/ssg-page-2" id="ssg-page-2">
        SSG Page 2 (Redirect)
      </Link>
      <div />
    </div>
  )
}
