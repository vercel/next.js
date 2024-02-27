export default function Hello({ params }) {
  return <h1 id="slug">{params.slug}</h1>
}

export function generateStaticParams() {
  return [
    {
      params: {
        slug: 'hello',
      },
    },
  ]
}

export const runtime = 'edge'
