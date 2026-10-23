export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  const name = new URL(request.url).searchParams.get('name')
  try {
    const mod = require(`../../mods/${name}.js`)
    return Response.json({ name: mod.name })
  } catch (e) {
    return Response.json({ error: String(e) })
  }
}
