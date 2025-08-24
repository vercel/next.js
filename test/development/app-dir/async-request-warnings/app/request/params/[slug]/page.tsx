function Component({ params }: { params: { slug: string } }) {
  const a = params.slug
  const b = params.slug

  const clonedParams = { ...params }
  return <pre>{JSON.stringify({ clonedParams, a, b }, null, 2)}</pre>
}

export default function Page({ params }: { params: { slug: string } }) {
  const slug = params.slug

  return (
    <>
      <pre>{JSON.stringify({ slug }, null, 2)}</pre>
      <Component params={params} />
      <Component params={params} />
    </>
  )
}
