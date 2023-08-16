export default function Page({ params }) {
  return (
    <>
      <p id="page">/partial-gen-params/[lang]/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
