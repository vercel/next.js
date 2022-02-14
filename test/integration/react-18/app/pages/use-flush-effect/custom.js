import { useFlushEffects } from 'next/streaming'

export default function Custom() {
  if (typeof window === 'undefined') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFlushEffects([
      () => <script id="custom-flush-effect-1">foo</script>,
      () => <script id="custom-flush-effect-2">bar</script>,
    ])
  }
  return null
}
