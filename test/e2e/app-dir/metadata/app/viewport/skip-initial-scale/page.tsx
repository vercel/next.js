import type { Viewport } from 'next'

export default function Page() {
  return <p>skip initial scale</p>
}

export const viewport: Viewport = {
  initialScale: undefined,
}
