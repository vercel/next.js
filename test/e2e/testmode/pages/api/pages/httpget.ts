import { get } from 'node:https'

export default async function handler(req, res) {
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
  res.status(200).json({ text })
}
