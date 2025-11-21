'use cache'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((response) => response.text())

  return <p>{data}</p>
}
