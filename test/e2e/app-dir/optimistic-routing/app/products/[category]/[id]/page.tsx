import { connection } from 'next/server'
import Link from 'next/link'

export default async function ProductPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>
}) {
  const { category, id } = await params
  await connection()

  return (
    <div id="product-page">
      <h1 id="product-title">
        Product: {category}/{id}
      </h1>
      <p id="product-category">Category: {category}</p>
      <p id="product-id">ID: {id}</p>
      <Link href="/" id="back-link">
        Back to home
      </Link>
    </div>
  )
}
