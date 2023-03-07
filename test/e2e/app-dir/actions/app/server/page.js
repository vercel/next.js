import Counter from './counter'

import double, { inc, dec } from './actions'

export default function Page() {
  return <Counter inc={inc} dec={dec} double={double} />
}
