import deleteFromDb from 'db'

export function Item(product, foo, bar) {
  async function deleteItem() {
    'use server'
    await deleteFromDb(
      product.id,
      product?.foo,
      product.bar.baz,
      product[(foo, bar)]
    )
  }
  return <Button action={deleteItem}>Delete</Button>
}
