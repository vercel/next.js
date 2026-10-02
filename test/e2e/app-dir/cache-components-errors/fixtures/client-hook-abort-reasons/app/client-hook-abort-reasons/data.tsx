export async function DataSlot() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return <p>data slot</p>
}
