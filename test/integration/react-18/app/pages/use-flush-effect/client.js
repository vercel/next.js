import { useFlushEffects } from 'next/streaming'

export default function Client() {
  useFlushEffects([])
  return null
}
