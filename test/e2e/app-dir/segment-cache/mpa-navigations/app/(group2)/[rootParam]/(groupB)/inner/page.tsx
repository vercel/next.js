export function generateStaticParams() {
  return [{ rootParam: 'foo' }, { rootParam: 'bar' }]
}
export default async function Page() {
  return <p>Content of inner page</p>
}
