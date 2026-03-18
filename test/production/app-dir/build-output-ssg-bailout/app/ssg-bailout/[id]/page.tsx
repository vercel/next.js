export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await searchParams
  return <p>hello world {id}</p>
}

export async function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}
