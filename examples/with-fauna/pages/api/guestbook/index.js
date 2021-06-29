import { getAllGuestbookEntries, createGuestbookEntry } from '@/lib/fauna'
import session from '@/lib/session'

export default async function handler(req, res) {
  session(req, res)

  const { login, email } = req.session

  if (req.method === 'GET') {
    const entries = await getAllGuestbookEntries()

    return res.json(entries)
  }

  if (req.method === 'POST') {
    if (!login) {
      return res.status(403).send('Unauthorized')
    }

    const id = Date.now()
    const newEntry = {
      id,
      email,
      updated_at: Date.now(),
      body: (req.body.body || '').slice(0, 500),
      created_by: login,
    }

    await createGuestbookEntry(newEntry)
    return res.status(200).json(newEntry)
  }

  return res.send('Method not allowed.')
}
