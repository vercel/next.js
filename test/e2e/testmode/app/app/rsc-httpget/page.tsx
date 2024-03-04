import { get } from 'node:https'

// We want to trace this fetch in runtime
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return {}
}

export default async function Page() {
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
  return <pre>{text}</pre>
}
