export async function generateStaticParams() {
  const params = await getParams()
  return params.map((p) => ({ slug: p }))
}
