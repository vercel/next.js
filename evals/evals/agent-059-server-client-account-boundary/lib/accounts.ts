import { findAccountByUserId } from './db'
import { getCurrentUser } from './session'

export { notificationChannels, notificationChannelSchema } from './preferences'
export type { NotificationChannel } from './preferences'

export async function getCurrentAccount() {
  const user = await getCurrentUser()
  return findAccountByUserId(user.id)
}

export type Account = Awaited<ReturnType<typeof getCurrentAccount>>
