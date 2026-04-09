export default function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <p id="item-page" data-testid="item-page">
      Item page (dynamic route)
    </p>
  )
}
