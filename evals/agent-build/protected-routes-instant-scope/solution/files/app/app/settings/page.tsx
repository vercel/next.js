import { Suspense } from 'react'
import { requireSession } from '@/lib/session'

export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <Suspense
        fallback={<p data-testid="settings-loading">Loading settings…</p>}
      >
        <TeamSettings />
      </Suspense>
    </>
  )
}

async function TeamSettings() {
  const session = await requireSession()

  return (
    <dl>
      <dt>Team</dt>
      <dd data-testid="settings-team">{session.teamName}</dd>
      <dt>Owner</dt>
      <dd data-testid="settings-owner">{session.name}</dd>
      <dt>Invoice numbering</dt>
      <dd>INV-{session.teamId === 'bletchley' ? '2' : '1'}xxx</dd>
    </dl>
  )
}
