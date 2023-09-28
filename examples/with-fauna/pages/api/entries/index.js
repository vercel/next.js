import { Client, fql } from 'fauna'

const client = new Client({
  secret: process.env.FAUNA_CLIENT_SECRET,
})

export default async function handler(req, res) {
  const handlers = {
    // Get all entries from Fauna
    GET: async () => {
      try {
        const dbresponse = await client.query(fql`
          Entry.all()
        `)
        res.json(dbresponse.data.data)
      } catch (error) {
        res.status(403).json({
          error: error.message,
        })
      }
    },

    // Create a new entry in Fauna
    POST: async () => {
      const {
        body: { name, message },
      } = req
      res.json({})

      try {
        const dbresponse = await client.query(fql`
          Entry.create({
            name: ${name},
            message: ${message},
            createdAt: Time.now(),
          })
        `)
        res.json(dbresponse.data.data)
      } catch (error) {
        res.status(403).json({
          error: error.message,
        })
      }

    },
  }

  if (!handlers[req.method]) {
    return res.status(405).end()
  }

  await handlers[req.method]()
}