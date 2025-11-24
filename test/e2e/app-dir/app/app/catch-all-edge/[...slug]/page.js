export const runtime = 'edge'

export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <p>catch-all edge page</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
