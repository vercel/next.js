export default function Page({ params }) {
  return (
    <h1 id="text" data-params={params.slug?.join('/') ?? ''}>
      hello from /catch-all-optional/{params.slug?.join('/')}
    </h1>
  )
}
