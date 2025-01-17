export function generateStaticParams() {
  return [{ slug: 'foo' }]
}

export default async function Page(props) {
  const params = await props.params
  return (
    <div id="container">
      Hello World!
      <Component id={params.slug} />
    </div>
  )
}

async function Component({ id }) {
  const dynamicData = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/random?id=${id}`,
    { cache: 'no-store' }
  )

  const randomNumber = await dynamicData.json()

  return (
    <div id="dynamic">
      Random Number: <div id="state">{randomNumber}</div>
    </div>
  )
}
