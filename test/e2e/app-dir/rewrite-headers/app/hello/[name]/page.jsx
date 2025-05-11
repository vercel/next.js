export default async function Page(props) {
  const { name } = await props.params
  return <div>Hello {name}</div>
}

export async function generateStaticParams() {
  return [{ name: 'world' }, { name: 'wyatt' }, { name: 'admin' }]
}
