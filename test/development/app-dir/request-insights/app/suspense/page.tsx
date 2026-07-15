export default async function SuspendedPage() {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return <p>loaded</p>
}
