import deleteFromDb from 'db'

const v1 = 'v1'

export function Item({ id1, id2 }) {
  const v2 = id2
  async function deleteItem() {
    'use server'
    await deleteFromDb(id1)
    await deleteFromDb(v1)
    await deleteFromDb(v2)
  }
  return <Button action={deleteItem}>Delete</Button>
}
