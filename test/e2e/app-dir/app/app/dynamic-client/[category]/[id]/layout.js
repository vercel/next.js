export default async function IdLayout(props) {
  const params = await props.params

  const { children } = props

  return (
    <>
      <h3>
        Id Layout. Params:{' '}
        <span id="id-layout-params">{JSON.stringify(params)}</span>
      </h3>
      {children}
    </>
  )
}
