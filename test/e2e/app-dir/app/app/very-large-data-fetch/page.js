export default async function Home() {
  const res = await fetch(
    `http://localhost:${process.env.API_SERVER_PORT || 3000}/api/large-data`
  )
  const resClone = res.clone()
  const json = await resClone.json()
  const firstItem = json.arrayOfObjects[0]

  return (
    <>
      <h1 id="done">Hello world</h1>
      <p id="index">{firstItem.index}</p>
      <p id="random">{firstItem.random}</p>
    </>
  )
}
