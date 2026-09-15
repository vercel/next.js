'use client'

export default function ClientComponent(props: {
  // @ts-ignore -- This non-serializable prop is intentionally exposed.
  _ignoredFunction: () => void
  // @ts-expect-error -- This non-serializable prop is intentionally exposed.
  _expectedFunction: () => void
  // @ts-expect-error -- This directive should remain unused.
  _serializable: string
  _unsuppressedFunction: () => void
}) {
  return <p>hello world</p>
}
