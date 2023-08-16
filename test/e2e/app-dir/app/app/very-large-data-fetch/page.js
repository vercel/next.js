export default async function Home() {
  const res = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/data?amount=128000`
  )
  const resClone = res.clone()
  const json = await resClone.json()

  return (
    <>
      <h1 id="done">Hello world</h1>
      <p>item count {json.data.length}</p>
    </>
  )
}
