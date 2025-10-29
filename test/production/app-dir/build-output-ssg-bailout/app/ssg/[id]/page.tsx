export default function Page() {
  return <p>hello world</p>
}

export function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}
