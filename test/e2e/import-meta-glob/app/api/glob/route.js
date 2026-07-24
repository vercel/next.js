const modules = import.meta.glob('../../../lib/modules/*.ts')

export async function GET() {
  const values = []
  for (const loader of Object.values(modules)) {
    const mod = await loader()
    values.push(mod.name)
  }
  return Response.json({ values: values.sort() })
}
