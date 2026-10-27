import { get } from 'node:http'

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url')!
  const result = await new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'accept-encoding': 'gzip' } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('error', reject)
      res.on('end', () => {
        resolve({
          headers: res.headers,
          body: Buffer.concat(chunks).toString('base64'),
        })
      })
    })
    req.on('error', reject)
    req.setTimeout(3000, () => req.destroy(new Error('HTTP request timed out')))
  })
  return Response.json(result)
}
