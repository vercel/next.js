import { getAllEntries } from '@/lib/fauna'
import GuestbookPage from './guestbook-page'

export default async function Page() {
  const entries = await getAllEntries()
  return <GuestbookPage entries={entries} />
}
