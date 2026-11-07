export default function NotFound() {
  return <div id="not-found">Dynamic item not found</div>
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  return {
    title: `Item ${id} Not Found`,
    description: `The item with id "${id}" could not be found`,
  }
}
