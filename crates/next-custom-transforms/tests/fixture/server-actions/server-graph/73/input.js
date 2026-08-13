'use cache'

// Route segment configs, metadata, and viewport are statically known
// non-function values. They should be exported as-is, without cache runtime
// wrappers.
export const instant = false
export const dynamicParams = true
export const prefetch = 'partial'
export const maxDuration = 5
export const metadata = { title: 'Hello' }

export default async function Page() {
  return null
}
