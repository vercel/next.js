export default async function DynamicLayout(props) {
  const params = await props.params

  const { children } = props

  return (
    <>
      <h1>
        Dynamic Layout. Params:{' '}
        <span id="dynamic-layout-params">{JSON.stringify(params)}</span>
      </h1>
      {children}
    </>
  )
}
