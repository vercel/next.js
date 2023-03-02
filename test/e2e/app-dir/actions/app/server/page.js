import Counter from './counter'

import { inc, dec } from './actions'

export default function Page() {
  return <Counter inc={inc} dec={dec} />
}
