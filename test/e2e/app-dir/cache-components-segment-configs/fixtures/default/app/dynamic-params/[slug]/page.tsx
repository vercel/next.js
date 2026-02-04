// Return a list of `params` to populate the [slug] dynamic segment
export async function generateStaticParams() {
  return [{ slug: 'foo' }, { slug: 'bar' }, { slug: 'baz' }]
}

export default async function Page(props) {
  const params = await props.params
  const { slug } = params
  return <div>Hello from {slug}</div>
}

export const dynamicParams = false
