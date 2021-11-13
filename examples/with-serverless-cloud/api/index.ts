import { api, data } from '@serverless/cloud'

api.get('/users', async (_req, res) => {
  let result = await data.get('user:*', true)
  res.send(result)
})

api.get('/users/:id', async (req, res) => {
  let result = await data.get(`user:${req.params.id}`, true)
  res.send(result)
})
