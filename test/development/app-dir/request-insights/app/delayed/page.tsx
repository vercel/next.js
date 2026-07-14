export default async function DelayedPage() {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return <p>loaded</p>
}
