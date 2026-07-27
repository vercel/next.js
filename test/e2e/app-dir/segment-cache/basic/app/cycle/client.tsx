'use client'

export function ClientComponent({ testProp }: { testProp: { self: unknown } }) {
  return (
    <div id="cycle-check">
      {testProp.self === testProp ? 'Cycle resolved' : 'Cycle broken'}
    </div>
  )
}
