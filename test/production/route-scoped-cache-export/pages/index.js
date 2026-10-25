import Link from 'next/link'
export default function Page() {
  return (
    <>
      <p id="state">export-home</p>
      <Link id="pages-link" href="/posts/known">
        post
      </Link>
      <Link id="app-link" href="/article/known">
        article
      </Link>
    </>
  )
}
