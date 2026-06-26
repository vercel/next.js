import { Button } from 'components'
import deleteFromDb from 'db'

const v1 = 'v1'

export function Item({ id1, id2 }) {
  const v2 = id2
  return (
    <>
      <Button
        action={async () => {
          'use server'
          await deleteFromDb(id1)
          await deleteFromDb(v1)
          await deleteFromDb(v2)
        }}
      >
        Delete
      </Button>
      <Button
        action={async function () {
          'use server'
          await deleteFromDb(id1)
          await deleteFromDb(v1)
          await deleteFromDb(v2)
        }}
      >
        Delete
      </Button>
    </>
  )
}
