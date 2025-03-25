'use cache'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const param = (await searchParams).foo

  return <p>param: {param}</p>
}
