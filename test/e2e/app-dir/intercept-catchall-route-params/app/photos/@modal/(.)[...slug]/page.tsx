import { ClientParams } from './params'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return (
    <>
      <pre id="server-params">{JSON.stringify(slug)}</pre>
      <ClientParams />
    </>
  )
}
