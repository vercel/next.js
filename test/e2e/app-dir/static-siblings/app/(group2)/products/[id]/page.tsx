export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <p id="product-page" data-testid="product-page">
      Product page (dynamic route)
    </p>
  )
}
