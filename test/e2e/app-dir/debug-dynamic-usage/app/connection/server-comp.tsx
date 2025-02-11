export async function ServerComp({ promise }: { promise: Promise<void> }) {
  await promise
  return <pre>{Math.random()}</pre>
}
