export const fetchCount = async (amount = 1): Promise<{ data: number }> => {
  const response = await fetch('http://localhost:3000/api/counter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  })
  const result = await response.json()

  return result
}
