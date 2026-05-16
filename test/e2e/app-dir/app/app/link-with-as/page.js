import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link
        href="/dashboard/deployments/info/[id]"
        as="/dashboard/deployments/info/123"
        id="link-to-info-123"
      >
        To info 123
      </Link>
    </>
  )
}
