export default function Page({ searchParams, params }) {
  return (
    <dl>
      <dt>params.key</dt>
      <dd data-params>{params.key}</dd>
      <dt>searchParams.key</dt>
      <dd data-searchParams>{searchParams.key}</dd>
    </dl>
  )
}
