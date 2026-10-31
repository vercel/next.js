'use client'

// @ts-expect-error
if (typeof window !== 'undefined') window.client = true

export function Component() {
  return <div>client component</div>
}
