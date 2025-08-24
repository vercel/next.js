export const revalidate = 0

export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <p id="page">/dynamic-no-gen-params-ssr</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
