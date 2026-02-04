import { Button } from 'components'
import deleteFromDb from 'db'

const v1 = 'v1'

export function Item({ id1, id2 }) {
  const v2 = id2
  const deleteItem = async () => {
    'use server'
    await deleteFromDb(id1)
    await deleteFromDb(v1)
    await deleteFromDb(v2)
  }
  return <Button action={deleteItem}>Delete</Button>
}

let f = (x) => {
  async function g(y, ...z) {
    'use server'
    return x + y + z[0]
  }
}

const g = (x) => {
  f = async (y, ...z) => {
    'use server'
    return (
      x +
      y +
      // can't be a `ts-expect-error` because the type of `z` changes to `any` in the output
      // and it stops being an error
      //
      // @ts-ignore: incompatible argument types
      z[0]
    )
  }
}
