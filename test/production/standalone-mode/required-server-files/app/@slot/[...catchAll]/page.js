export default async function Page({ params }) {
  return (
    <>
      <p id="slot-page">/@slot/[[...catchAll]]/page.js</p>
      <p id="slot-params">{JSON.stringify(await params)}</p>
    </>
  )
}
