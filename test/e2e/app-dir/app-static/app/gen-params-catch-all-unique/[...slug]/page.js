export const dynamicParams = false

export default async function Page({ params }) {
  const { slug } = await params
  return <p>Test {slug.join('/')}</p>
}

export function generateStaticParams() {
  return [
    {
      slug: ['foo', 'foo'],
    },
    {
      slug: ['foo', 'bar'],
    },
  ]
}
