import { getSession } from '@/lib/session'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) return null

  return (
    <>
      <h1>Settings</h1>
      <dl>
        <dt>Team</dt>
        <dd data-testid="settings-team">{session.teamName}</dd>
        <dt>Owner</dt>
        <dd data-testid="settings-owner">{session.name}</dd>
        <dt>Invoice numbering</dt>
        <dd>INV-{session.teamId === 'bletchley' ? '2' : '1'}xxx</dd>
      </dl>
    </>
  )
}
