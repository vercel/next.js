export async function ServerComp({ promise }: { promise: Promise<string> }) {
  return <pre>{await promise}</pre>
}
