export const FEATURED_EVENT_SLUG = 'launch-day'

const events = {
  [FEATURED_EVENT_SLUG]: {
    title: 'Launch Day',
    description: 'Follow the launch as it happens.',
  },
} as const

export async function getEvent(slug: string) {
  return events[slug as keyof typeof events] ?? null
}
