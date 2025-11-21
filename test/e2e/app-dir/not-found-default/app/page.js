import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>hello world</p>
      <div>
        <Link id="navigate-not-found" href="/navigate-not-found">
          navigate to page calling notfound()
        </Link>
      </div>
      <div>
        <Link id="metadata-layout-not-found" href="/metadata-layout-not-found">
          navigate to layout with metadata API calling notfound()
        </Link>
      </div>
    </div>
  )
}
