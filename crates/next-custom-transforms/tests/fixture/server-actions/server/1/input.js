import deleteFromDb from 'db'

export function Item({ id1, id2 }) {
  async function deleteItem() {
    'use server'
    await deleteFromDb(id1)
    await deleteFromDb(id2)
  }
  return <Button action={deleteItem}>Delete</Button>
}

export default function Home() {
  const info = {
    name: 'John',
    test: 'test',
  }
  const action = async () => {
    'use server'
    console.log(info.name)
    console.log(info.test)
  }
  return null
}
