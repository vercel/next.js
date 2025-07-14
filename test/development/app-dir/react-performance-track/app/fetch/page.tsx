async function abstraction() {
  await fetch('https://next-data-api-endpoint.vercel.app/api/random')
}

export default async function FetchPage() {
  await abstraction()
  await fetch('https://next-data-api-endpoint.vercel.app/api/random')

  return <p>Done</p>
}
