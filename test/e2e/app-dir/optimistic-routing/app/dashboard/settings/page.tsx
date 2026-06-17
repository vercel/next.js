import { connection } from 'next/server'
import Link from 'next/link'

export default async function SettingsPage() {
  await connection()
  return (
    <div id="settings-page">
      <h1 id="settings-title">Settings</h1>
      <Link href="/" id="back-link">
        Back to home
      </Link>
    </div>
  )
}
