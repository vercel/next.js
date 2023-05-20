import useSWR from 'swr'
import type { User } from 'pages/api/user'
import type { Events } from 'pages/api/events'

export default function useEvents(user: User | undefined) {
  // We do a request to /api/events only if the user is logged in
  const { data: events } = useSWR<Events>(
    user?.isLoggedIn ? `/api/events` : null
  )

  return { events }
}
