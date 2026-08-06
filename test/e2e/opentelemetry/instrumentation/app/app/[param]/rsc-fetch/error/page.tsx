export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { status } = await searchParams

  if (status === 'error') {
    throw new Error('Error from Server Component')
  }

  return <p>Page</p>
}
