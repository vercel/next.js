import Counter from './counter'
import Form from './form'
import ClientForm from './client-form'

import dec, { inc } from './actions'
import { log } from './actions-2'

export default function Page() {
  const two = { value: 2 }
  return (
    <>
      <Counter
        inc={inc}
        dec={dec}
        double={async (x) => {
          'use server'
          return x * two.value
        }}
      />
      <Form />
      <ClientForm />
      <form>
        <button id="log" formAction={log}>
          log
        </button>
      </form>
    </>
  )
}
