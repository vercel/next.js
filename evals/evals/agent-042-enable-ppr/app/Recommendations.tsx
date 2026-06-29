async function getRecommendations() {
  const res = await fetch('https://api.example.com/recommendations')
  return res.json()
}

export async function Recommendations() {
  const items = await getRecommendations()

  return (
    <div>
      <h2>Recommended for you</h2>
      <ul>
        {items.map((item: { id: string; name: string }) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </div>
  )
}
