'use cache'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  let param: string | string[] | undefined

  try {
    param = (await searchParams).foo
  } catch {}

  return <p>param: {param}</p>
}
