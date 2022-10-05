export default function Page({ params }) {
  return (
    <>
      <p id="page">/dynamic-no-gen-params</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
