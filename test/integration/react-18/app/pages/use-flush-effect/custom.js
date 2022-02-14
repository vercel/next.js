import { useFlushEffects } from 'next/streaming'

export default function Custom() {
  if (typeof window === 'undefined') {
    useFlushEffects([
      () => <script class="custom-flush-effect-1" />,
      () => <script class="custom-flush-effect-2" />,
    ])
  }
  return null
}
