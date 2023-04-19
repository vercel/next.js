import deleteFromDb from 'db'

export function Item({ id1, id2 }) {
  async function deleteItem() {
    'use server'
    await deleteFromDb(id1)
    await deleteFromDb(id2)
  }
  return <Button action={deleteItem}>Delete</Button>
}
