import { notificationChannelSchema } from './preferences'

const accounts = [
  {
    userId: 'user-alex',
    name: 'Alex Rivera',
    email: 'alex@example.test',
    plan: 'Pro',
    notificationChannel: 'sms',
    recoveryToken: 'fixture-alex-recovery-token',
    internalRiskScore: 72,
    billingNotes: 'Fixture internal billing review for Alex',
  },
  {
    userId: 'user-sam',
    name: 'Sam Lee',
    email: 'sam@example.test',
    plan: 'Team',
    notificationChannel: 'email',
    recoveryToken: 'fixture-sam-recovery-token',
    internalRiskScore: 18,
    billingNotes: 'Fixture internal billing review for Sam',
  },
]

// In-memory database fixture; callers receive the complete stored record.
export async function findAccountByUserId(userId: string) {
  const account = accounts.find((record) => record.userId === userId)
  if (!account) throw new Error('Account not found')

  const channel = notificationChannelSchema.safeParse(
    account.notificationChannel
  )
  if (!channel.success) throw new Error(channel.error)

  return { ...account, notificationChannel: channel.data }
}
