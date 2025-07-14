export default async function ShopPage(
  props: PageProps<'/shop/[[...category]]'>
) {
  const { category } = await props.params
  return <div>Shop: {category?.join('/') || 'all'}</div>
}
