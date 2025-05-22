export default async function Page({ params }) {
  const { slug } = await params
  return <div data-testid={`hello-${slug}`}>Hello /{slug}</div>
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
