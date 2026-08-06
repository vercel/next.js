import Link from 'next/link'

export default async function ConsecutiveDynamicPage(props: {
  params: Promise<{ a: string; b: string; c: string }>
}) {
  const params = await props.params
  return (
    <div>
      <div id="consecutive-page">
        Path: {params.a}/{params.b}/{params.c}
      </div>
      <Link href={`/${params.a}/${params.b}/${params.c}/item`} id="item-link">
        View Item
      </Link>
    </div>
  )
}
