'use cache'

// Only the exports that got a reference ID in the server graph become server
// references here. The statically known non-function values are dropped.
export const instant = false
export const dynamicParams = true
export const prefetch = 'partial'
export const maxDuration = 5
export const metadata = { title: 'Hello' }

export default async function Page() {
  return null
}
