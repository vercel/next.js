export default function page() {
  return 'typing'
}

export async function generateStaticParams({
  params,
}: {
  params: { slug: string }
}) {
  console.log(params)
  return [{ slug: 'foo' }]
}
