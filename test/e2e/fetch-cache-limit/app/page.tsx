export default async function Page() {
  const resp = await fetch(`http://localhost:${process.env.PORT}/api/mock`, {
    cache: 'force-cache',
  })
  const data = await resp.json()

  return <p id="content">{data.content}</p>
}
