export default function Page({ params: { id } }) {
  return (
    <div>
      <h2>main slot</h2>
      <p id="main-slot">{id}</p>
    </div>
  )
}
