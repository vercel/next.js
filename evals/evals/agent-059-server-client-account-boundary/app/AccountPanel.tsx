import { notificationChannels, type Account } from '@/lib/accounts'

export function AccountPanel({ account }: { account: Account }) {
  return (
    <section>
      <h2>{account.name}</h2>
      <p>Plan: {account.plan}</p>
      <p>Email: {account.email}</p>
      <p>Notifications: {account.notificationChannel}</p>
      <p>Available channels: {notificationChannels.join(', ')}</p>
    </section>
  )
}
