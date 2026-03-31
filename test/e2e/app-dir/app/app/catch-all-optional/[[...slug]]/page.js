export default async function Page(props) {
  const params = await props.params
  return (
    <h1 id="text" data-params={params.slug?.join('/') ?? ''}>
      hello from /catch-all-optional/{params.slug?.join('/')}
    </h1>
  )
}
