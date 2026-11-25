export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  return <p id="dynamic">dynamic {id}</p>
}
