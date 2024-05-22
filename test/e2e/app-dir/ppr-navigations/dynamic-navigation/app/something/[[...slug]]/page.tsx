import Link from 'next/link'
// import { DynamicThing } from '../../DynamicThing'

export default async function Page({ params }) {
  if (params.slug !== '1') {
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  return (
    <div>
      <h1>Dynamic Page</h1>
      <p>Params: {JSON.stringify(params)}</p>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i}>
          <Link href={`/something/${i}`}>Go to /something/{i}</Link>
        </div>
      ))}
      {/* <DynamicThing /> */}
    </div>
  )
}
