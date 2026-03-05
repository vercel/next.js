export const agent = 'all'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <main>
      <h1>Product {id}</h1>
      <p>Dynamic product content for agent conversion.</p>
    </main>
  )
}
