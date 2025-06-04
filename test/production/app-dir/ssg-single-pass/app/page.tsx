export const revalidate = 1

export default async function Home() {
  console.log('home page rendered')
  const randomNumber = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())
  return (
    <div>
      <p id="random-number">{randomNumber}</p>
    </div>
  )
}
