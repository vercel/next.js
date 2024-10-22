export default async function IdPage({ children, params, searchParams }) {
  return (
    <>
      <p>
        Id Page. Params:{' '}
        <span id="id-page-params">{JSON.stringify(params)}</span>
      </p>
      {children}
      <p id="search-params">{JSON.stringify(await searchParams)}</p>
    </>
  )
}
