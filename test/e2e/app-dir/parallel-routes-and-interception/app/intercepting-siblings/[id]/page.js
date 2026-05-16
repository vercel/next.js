export default async function Page({ params }) {
  const { id } = await params
  return (
    <div>
      <h2>main slot</h2>
      <p id="main-slot">{id}</p>
    </div>
  )
}
