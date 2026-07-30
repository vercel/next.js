import type { Metadata } from 'next'

export const instant = { level: 'experimental-error' }

export async function generateMetadata(): Promise<Metadata> {
  await new Promise<void>((resolve) => process.nextTick(resolve))
  return { title: 'safe clock' }
}

export default function Page() {
  return <p>safe clock</p>
}
