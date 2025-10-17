export default async function ItemModal(props: {
  params: Promise<{ a: string; b: string; c: string }>
}) {
  const params = await props.params
  return (
    <div id="item-modal">
      Modal: Item for path {params.a}/{params.b}/{params.c}
    </div>
  )
}
