export default function Page({ params }) {
  return (
    <>
      <p id="page">/gen-params-top-down-page/[lang]</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
