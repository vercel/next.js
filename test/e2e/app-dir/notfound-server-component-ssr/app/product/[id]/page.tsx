import { notFound } from 'next/navigation'

// Only "1" is a valid product; anything else triggers `notFound()` from within
// this Server Component.
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (id !== '1') {
    notFound()
  }

  return <p id="product">product {id}</p>
}
