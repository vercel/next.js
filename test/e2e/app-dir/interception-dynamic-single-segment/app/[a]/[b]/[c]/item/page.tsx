export default async function ItemPage(props: {
  params: Promise<{ a: string; b: string; c: string }>
}) {
  const params = await props.params
  return (
    <div id="item-page">
      Item for path: {params.a}/{params.b}/{params.c}
    </div>
  )
}
