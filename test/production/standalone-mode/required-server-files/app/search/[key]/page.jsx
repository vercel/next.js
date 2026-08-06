export default async function Page({ searchParams, params }) {
  return (
    <dl>
      <dt>params.key</dt>
      <dd data-params>{(await params).key}</dd>
      <dt>searchParams.key</dt>
      <dd data-searchParams>{(await searchParams).key}</dd>
    </dl>
  )
}
