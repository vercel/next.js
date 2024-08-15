import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <span id="pages-page">Pages Page</span>
      <Link id="link-to-app" href="/app">
        To App
      </Link>
    </div>
  )
}
