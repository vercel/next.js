export default async function CategoryLayout(props) {
  const params = await props.params

  const { children } = props

  return (
    <>
      <h2>
        Category Layout. Params:{' '}
        <span id="category-layout-params">{JSON.stringify(params)}</span>{' '}
      </h2>
      {children}
    </>
  )
}
