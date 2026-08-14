export async function generateMetadata() {
  await Promise.resolve()
  throw new Error('unrendered slot metadata error')
}

export default function ErrorSlot() {
  return <div>error slot</div>
}
