export default async function Page() {
  for (let i = 0; i < 2 ** 26; i++) {
    await Promise.resolve()
  }
  return <p>done</p>
}
