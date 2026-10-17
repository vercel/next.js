export default async function NotFound() {
  const { bar } = await import('../packages/fixture/src/index.js')
  return <main>{bar} not found</main>
}
