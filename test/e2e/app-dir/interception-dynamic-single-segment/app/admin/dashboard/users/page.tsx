import Link from 'next/link'

export default function UsersPage() {
  return (
    <div>
      <div id="users-page">Admin Dashboard - Users</div>
      <Link href="/admin/dashboard/users/new" id="new-user-link">
        New User
      </Link>
    </div>
  )
}
