export const runtime = 'edge'

const delay = 3000

export default async function Page(props) {
  const start = Date.now()
  const data = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/delay?delay=${delay}`,
    { next: { revalidate: 3 } }
  ).then((res) => res.json())
  const fetchDuration = Date.now() - start

  return (
    <>
      <p id="data">
        {JSON.stringify({ fetchDuration, data, now: Date.now(), start })}
      </p>
    </>
  )
}
