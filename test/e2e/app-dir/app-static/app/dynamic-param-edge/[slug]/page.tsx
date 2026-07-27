export default async function Hello({ params }) {
  return <h1 id="slug">{(await params).slug}</h1>
}

export const runtime = 'edge'
