export default async function IdPage(props) {
  const params = await props.params
  const searchParams = await props.searchParams

  const { children } = props

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
