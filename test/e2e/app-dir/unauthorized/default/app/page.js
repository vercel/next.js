import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>hello world</p>
      <div>
        <Link id="navigate-unauthorized" href="/navigate-unauthorized">
          navigate to page calling unauthorized()
        </Link>
      </div>
      <div>
        <Link
          id="metadata-layout-unauthorized"
          href="/metadata-layout-unauthorized"
        >
          navigate to layout with metadata API calling unauthorized()
        </Link>
      </div>
    </div>
  )
}
