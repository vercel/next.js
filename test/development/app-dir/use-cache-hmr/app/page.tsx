async function getData() {
  'use cache'

  return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
    (res) => res.text().then((text) => [text, 'foo', Math.random()] as const)
  )
}

export default async function Page() {
  const [fetchedRandom, text, mathRandom] = await getData()

  return (
    <>
      <p id="fetchedRandom">{fetchedRandom}</p>
      <p id="text">{text}</p>
      <p id="mathRandom">{mathRandom}</p>
    </>
  )
}
