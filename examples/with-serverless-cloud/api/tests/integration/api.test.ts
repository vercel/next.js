import { api } from '@serverless/cloud'

test('should return user items', async () => {
  const { body } = await api.get('/users').invoke()

  expect(body).toHaveProperty('items')
  expect(body.items.length).toBeGreaterThan(0)
})
