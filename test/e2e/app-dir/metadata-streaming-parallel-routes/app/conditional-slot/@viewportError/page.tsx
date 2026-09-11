export async function generateViewport() {
  await Promise.resolve()
  throw new Error('unrendered slot viewport error')
}

export default function ViewportErrorSlot() {
  return <div>viewport error slot</div>
}
