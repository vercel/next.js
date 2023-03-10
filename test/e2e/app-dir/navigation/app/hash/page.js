export default function HashPage() {
  // Create list of 5000 items that all have unique id
  const items = Array.from({ length: 5000 }, (_, i) => ({ id: i }))

  return (
    <div>
      <h1>Hash Page</h1>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <div id={`hash-${item.id}`}>{item.id}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
