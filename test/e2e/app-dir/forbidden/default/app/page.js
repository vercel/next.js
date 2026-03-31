import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>hello world</p>
      <div>
        <Link id="navigate-forbidden" href="/navigate-forbidden">
          navigate to page calling forbidden()
        </Link>
      </div>
      <div>
        <Link id="metadata-layout-forbidden" href="/metadata-layout-forbidden">
          navigate to layout with metadata API calling forbidden()
        </Link>
      </div>
    </div>
  )
}
