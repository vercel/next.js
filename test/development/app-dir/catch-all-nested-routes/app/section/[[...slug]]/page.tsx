import { Heading } from './components/heading'

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  return (
    <>
      <Heading />
      <p id="section">section: {(slug ?? []).join('/')}</p>
    </>
  )
}
