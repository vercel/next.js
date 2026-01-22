export default function PanelItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <p id="panel-item-page" data-testid="panel-item-page">
      Panel item (dynamic in parallel route)
    </p>
  )
}
