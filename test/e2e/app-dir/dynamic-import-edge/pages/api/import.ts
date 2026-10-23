// Edge code can't load chunks on demand, so the modules a dynamic `import()` can
// reach are in the same chunk group.
export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  const name = new URL(request.url).searchParams.get('name')
  try {
    const mod = await import(`../../mods/${name}.js`)
    return Response.json({ name: mod.name, default: mod.default ?? null })
  } catch (e) {
    return Response.json({ error: String(e) })
  }
}
