export default async function Page({ params }) {
  const { slug } = await params
  return <div id="slug">Hello /{slug}</div>
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
