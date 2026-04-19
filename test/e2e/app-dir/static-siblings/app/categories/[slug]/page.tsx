export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <div id="category-page">
      <h1>Category: {slug}</h1>
      <p>Dynamic category page</p>
    </div>
  )
}
