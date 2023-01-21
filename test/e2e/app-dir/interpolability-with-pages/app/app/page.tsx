import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <span id="app-page">App Page</span>
      <Link id="link-to-pages" href="/pages">
        To Pages
      </Link>
    </div>
  )
}
