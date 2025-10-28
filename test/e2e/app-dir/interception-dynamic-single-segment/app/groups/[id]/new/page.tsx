export default async function NewItemPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  return <div id="new-page">New item for group {params.id}</div>
}
