export default async function Hello({ params }) {
  return <h1 id="slug">{(await params).slug}</h1>
}

export function generateStaticParams() {
  return [
    {
      slug: 'hello',
    },
  ]
}

export const runtime = 'edge'
