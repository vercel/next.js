'use cache'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  return (
    <p>
      Page: <span id="page-date">{new Date().toISOString()}</span>
    </p>
  )
}
