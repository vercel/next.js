export default async function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return `Photo page for id ${JSON.stringify(id)} (normal, not intercepted)`
}

export function generateStaticParams() {
  return [{ id: '1' }]
}
