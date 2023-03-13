import Counter from './counter'
import Form from './form'

import double, { inc, dec } from './actions'

export default function Page() {
  return (
    <>
      <Counter inc={inc} dec={dec} double={double} />
      <Form />
    </>
  )
}
