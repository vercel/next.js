import { Deta } from 'deta'

const deta = Deta(process.env.DETA_PROJECT_KEY)

const base = deta.Base('todos')

const handler = async (req, res) => {
  let { body, method } = req
  let respBody = {}

  if (method === 'GET') {
    const { items } = await base.fetch([])
    respBody = items
    res.statusCode = 200
  } else if (method === 'POST') {
    body = JSON.parse(body)
    body.isCompleted = false
    respBody = await base.put(body)
    res.statusCode = 201
  }

  res.json(respBody)
}

export default handler
