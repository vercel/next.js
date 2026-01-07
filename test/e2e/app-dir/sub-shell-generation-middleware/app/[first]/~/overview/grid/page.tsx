async function getMetadata() {
  'use cache'
  return {
    title: `Grid Page ${Math.random()}`,
  }
}

export async function generateMetadata() {
  return await getMetadata()
}

export default async function GridPage({
  params,
}: {
  params: Promise<{
    first: string
  }>
}) {
  const { first } = await params
  return (
    <div data-slug={`${first}/~/overview/grid`}>
      Page /{first}/~/overview/grid
    </div>
  )
}
