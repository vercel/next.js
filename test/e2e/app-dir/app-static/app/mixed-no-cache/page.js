export default async function Home() {
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())
  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      cache: 'no-store',
    }
  ).then((res) => res.text())
  const data3 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a'
  ).then((res) => res.text())
  const data4 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b'
  ).then((res) => res.text())

  return (
    <>
      <p>hello wolrd</p>
      <p id="data1">{data1}</p>
      <p id="data2">{data2}</p>
      <p id="data3">{data3}</p>
      <p id="data4">{data4}</p>
    </>
  )
}
