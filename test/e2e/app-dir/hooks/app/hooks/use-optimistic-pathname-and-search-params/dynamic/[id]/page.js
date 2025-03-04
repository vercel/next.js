export default async function Page({ params }) {
  const { id } = await params
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div id={`target-page`}>ID={id}</div>
}
