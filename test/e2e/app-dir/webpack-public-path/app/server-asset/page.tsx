import { connection } from 'next/server'
import { publicPath, setPublicPath } from '../shared'

export default async function Page() {
  await connection()
  const original = publicPath()
  setPublicPath('https://cdn.example/server/')
  try {
    const { assetUrl } = await import('./asset-url')
    return <p id="server-asset-url">{assetUrl}</p>
  } finally {
    setPublicPath(original)
  }
}
