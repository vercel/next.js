import { connection } from 'next/server'
import { Suspense } from 'react'
import { publicPath, setPublicPath } from '../shared'

async function Content() {
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

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  )
}
