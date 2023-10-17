export const runtime = 'edge'

import { fn1 } from '../fn'

export default function EdgePage() {
  fn1()
  return <p>hello world</p>
}
