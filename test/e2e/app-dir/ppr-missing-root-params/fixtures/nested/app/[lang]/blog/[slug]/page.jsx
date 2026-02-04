export default function Page() {
  return <p>hello world</p>
}

export async function generateStaticParams() {
  return [{ slug: 'hello-world' }]
}
