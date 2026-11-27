import { Button } from 'components'
import deleteFromDb from 'db'

export function Item({ id1, id2 }) {
  id1++
  return (() => {
    id1++
    return <Button action={deleteItem}>Delete</Button>
  })()

  async function deleteItem() {
    'use server'
    await deleteFromDb(id1)
    await deleteFromDb(id2)
  }
}
