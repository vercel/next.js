export default async function Page() {
  await new Promise((r) => setTimeout(r, 200))
  return <p>Page</p>
}
