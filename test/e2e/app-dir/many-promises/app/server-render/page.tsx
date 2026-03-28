export default async function Page() {
  const p = Promise.resolve()
  for (let i = 0; i < 2 ** 24; i++) {
    await p
  }
  return <p>done</p>
}
