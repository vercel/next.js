export default async function Page({ params }) {
  const { id } = await params
  return <p id="item-page">item {id}</p>
}
