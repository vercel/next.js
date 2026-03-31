export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  'use cache'

  const { slug } = await params

  return (
    <>
      <p>
        This page accesses params without defining any static params. This
        excludes the page from prerenders, and creates a dynamic hole. Without a
        parent suspense boundary, this will cause an error during prerendering.
      </p>
      <p>Slug: {slug}</p>
    </>
  )
}
