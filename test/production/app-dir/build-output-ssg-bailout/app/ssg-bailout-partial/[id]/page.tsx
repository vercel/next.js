export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ id: string }>
}) {
  const { id } = await params
  // Bail out for /ssg-bailout-partial/1 only.
  if (id === '1') {
    const { id } = await searchParams
    return <p>hello world {id}</p>
  }

  return <p>hello world</p>
}

export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}
