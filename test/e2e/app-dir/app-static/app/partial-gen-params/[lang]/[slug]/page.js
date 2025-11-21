export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <p id="page">/partial-gen-params/[lang]/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
