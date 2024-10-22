export default async function Page({ params }) {
  return (
    <div>
      <h2>intercepting-siblings</h2>
      <p id="intercepted-sibling">{(await params).id}</p>
    </div>
  )
}
