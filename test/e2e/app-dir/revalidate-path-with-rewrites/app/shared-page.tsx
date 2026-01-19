async function getData() {
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  return res.text()
}

export default async function SharedPage({
  isDynamic,
}: {
  isDynamic: boolean
}) {
  const data = await getData()

  return (
    <div>
      <h1>{isDynamic ? 'Dynamic' : 'Static'} Page</h1>
      <p>
        Random data: <span id="random-data">{data}</span>
      </p>
    </div>
  )
}
