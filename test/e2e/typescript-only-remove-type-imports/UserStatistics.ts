import type { User } from './User'

export function getNewsletterRecipients(users: User[]) {
  return users.map((u) => u.email)
}
