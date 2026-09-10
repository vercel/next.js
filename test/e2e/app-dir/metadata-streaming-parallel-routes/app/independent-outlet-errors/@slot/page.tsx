export function generateMetadata(): Promise<never> {
  return new Promise<never>(() => {})
}

export async function generateViewport() {
  await Promise.resolve()
  throw new Error('rendered slot viewport error')
}

export default function SlotPage() {
  return <div>slot page</div>
}
