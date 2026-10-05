export const notificationChannels = ['email', 'sms'] as const

export type NotificationChannel = (typeof notificationChannels)[number]

type ParseResult =
  | { success: true; data: NotificationChannel }
  | { success: false; error: string }

export const notificationChannelSchema = {
  safeParse(value: string): ParseResult {
    if (notificationChannels.includes(value as NotificationChannel)) {
      return { success: true, data: value as NotificationChannel }
    }

    return { success: false, error: 'Unsupported notification channel' }
  },
}
