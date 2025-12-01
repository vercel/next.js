export function Bar() {
  async function create() {
    'use server'
    console.log('Action called')
  }

  return <button onClick={create}>Bar</button>
}
