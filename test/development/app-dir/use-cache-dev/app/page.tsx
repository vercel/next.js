async function getRandomValue() {
  'use cache'

  return Math.random()
}

async function getData() {
  'use cache'

  return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
    (res) =>
      res
        .text()
        .then(async (text) => [text, 'foo', await getRandomValue()] as const)
  )
}

export default async function Page() {
  const [fetchedRandom, text, mathRandom] = await getData()

  return (
    <div id="container">
      <p id="fetchedRandom">{fetchedRandom}</p>
      <p id="text">{text}</p>
      <p id="mathRandom">{mathRandom}</p>
    </div>
  )
}
