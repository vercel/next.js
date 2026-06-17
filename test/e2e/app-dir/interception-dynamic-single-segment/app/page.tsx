import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/groups/123" id="groups-link">
        Group 123
      </Link>{' '}
      <Link href="/org/acme/team/engineering" id="team-link">
        Team
      </Link>{' '}
      <Link href="/x/y/z" id="consecutive-link">
        Consecutive
      </Link>{' '}
      <Link href="/admin/dashboard/users" id="admin-link">
        Admin
      </Link>
    </div>
  )
}
