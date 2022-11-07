export default async function Home() {
  const res = await fetch(
    `https://data-api-endpoint-nmw78dd69-ijjk-testing.vercel.app/api/data?amount=128000`
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
