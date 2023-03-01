export default function page() {
  return 'typing'
}

export async function generateStaticParams({
  params,
}: {
  params: { slug: 'a' | 'b' }
}) {
  console.log(params)
  return []
}
