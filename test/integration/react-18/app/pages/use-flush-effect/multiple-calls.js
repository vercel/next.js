import { useFlushEffects } from 'next/streaming'

function Component() {
  if (typeof window === 'undefined') {
    useFlushEffects([])
  }
  return null
}

export default function MultipleCalls() {
  return (
    <>
      <Component />
      <Component />
    </>
  )
}
