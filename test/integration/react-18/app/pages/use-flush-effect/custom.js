import { unstable_useFlushEffects } from 'next/streaming'

export default function Custom() {
  if (typeof window === 'undefined') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    unstable_useFlushEffects([
      () => <span id="custom-flush-effect-1">foo</span>,
      () => <span id="custom-flush-effect-2">bar</span>,
    ])
  }
  return null
}
