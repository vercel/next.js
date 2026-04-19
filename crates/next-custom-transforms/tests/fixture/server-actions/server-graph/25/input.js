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

// In this example, if Button immediately executes the action, different ids should
// be passed.
export function Item2({ id1, id2 }) {
  id1++
  const temp = []
  temp.push(<Button action={deleteItem}>Delete</Button>)

  id1++
  temp.push(<Button action={deleteItem}>Delete</Button>)

  return temp

  // FIXME: invalid transformation of hoisted functions (https://github.com/vercel/next.js/issues/57392)
  // (remove output.js from `tsconfig.json#exclude` to see the error)
  async function deleteItem() {
    'use server'
    await deleteFromDb(id1)
    await deleteFromDb(id2)
  }
}
