async function abstraction() {
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  await response.json()
}

export default async function FetchPage() {
  await abstraction()
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  await response.json()

  return <p>Done</p>
}
