export function Item() {
  async function deleteItem() {
    'use server'
    console.log('delete item')
  }
  return <button onClick={deleteItem}>Delete</button>
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
