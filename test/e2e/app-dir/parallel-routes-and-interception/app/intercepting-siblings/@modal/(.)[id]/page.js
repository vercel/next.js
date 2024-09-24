export default function Page({ params: { id } }) {
  return (
    <div>
      <h2>intercepting-siblings</h2>
      <p id="intercepted-sibling">{id}</p>
    </div>
  )
}
