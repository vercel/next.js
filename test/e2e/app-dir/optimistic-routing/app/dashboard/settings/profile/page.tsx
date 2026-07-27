import { connection } from 'next/server'
import Link from 'next/link'

export default async function ProfilePage() {
  await connection()
  return (
    <div id="profile-page">
      <h1 id="profile-title">Profile Settings</h1>
      <Link href="/" id="back-link">
        Back to home
      </Link>
    </div>
  )
}
