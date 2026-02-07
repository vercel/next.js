export default async function NewItemModal(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  return <div id="new-modal">Modal: New item for group {params.id}</div>
}
