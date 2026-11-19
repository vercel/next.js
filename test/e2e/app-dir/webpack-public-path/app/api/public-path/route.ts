import { publicPath, setPublicPath } from '../../shared'

export async function GET() {
  const original = publicPath()
  try {
    setPublicPath('https://cdn.example/server/')
    const { value } = await import('./value')
    return Response.json({ original, current: publicPath(), value })
  } finally {
    setPublicPath(original)
  }
}
