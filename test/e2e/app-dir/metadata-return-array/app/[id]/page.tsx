export default function Page() {
  return <p>hello world</p>
}

export async function generateMetadata() {
  return [
    {
      title: 'hello world',
      description: 'returned as an array',
    },
  ]
}
