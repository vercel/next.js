import { listGuestbookEntries, createGuestbookEntry } from '@/lib/fauna'

export default async function handler(req, res) {
  const handlers = {
    GET: async () => {
      const entries = await listGuestbookEntries()

      res.json(entries)
    },

    POST: async () => {
      const {
        body: { name, message },
      } = req
      const created = await createGuestbookEntry({
        name,
        message,
        createdAt: new Date(),
      })

      res.json(created)
    },
  }

  if (!handlers[req.method]) {
    return res.status(405).end()
  }

  await handlers[req.method]()
}
