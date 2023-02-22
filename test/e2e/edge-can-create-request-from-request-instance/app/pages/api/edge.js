export default async () => {
  const self = new Request('http://localhost:3000', { method: 'POST' })
  const other = new Request(self, { body: JSON.stringify('test') })

  if (self.method === other.method && (await other.json()) === 'test') {
    return new Response('Created Request from Request instance', {
      status: 200,
    })
  }

  return new Response('Could not create Request from Request instance', {
    status: 418,
  })
}

export const config = {
  runtime: 'edge',
}
