export default function IdPage({ params, searchParams }) {
  return (
    <>
      <p>
        Id Page. Params:{' '}
        <span id="id-page-params">{JSON.stringify(params)}</span>
      </p>

      <p id="search-params">{JSON.stringify(searchParams)}</p>
    </>
  )
}
