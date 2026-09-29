export default async function Page() {
  const { bar } = await import('../packages/fixture/src/index.js')
  return <main>{bar}</main>
}
