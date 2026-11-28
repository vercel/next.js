export default async function Page() {
  console.log('promises start')
  const p = Promise.resolve()
  for (let chunk = 0; chunk < 2 ** 4; chunk++) {
    await new Promise((resolve) => setImmediate(resolve))
    for (let i = 0; i < 2 ** 16; i++) {
      await p
    }
  }
  console.log('promises end')

  return <p>done</p>
}
