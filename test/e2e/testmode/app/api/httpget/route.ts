import { get } from 'node:https'

export const dynamic = 'force-dynamic'

export async function GET() {
  const text = await new Promise<string>((resolve, reject) => {
    get('https://example.com', (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve(data)
      })
    }).on('error', (err) => {
      reject(err)
    })
  })
  return new Response(JSON.stringify({ text }))
}
