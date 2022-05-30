import Link from 'next/link'

export default function DashboardIndexPage() {
  return (
    <>
      <p>hello from root/dashboard/index</p>
      <Link href="/dashboard/integrations" legacyBehavior={false}>
        To Integrations
      </Link>
    </>
  )
}
