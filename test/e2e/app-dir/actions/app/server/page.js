import Counter from './counter'
import Form from './form'
import ClientForm from './client-form'

import dec, { slowInc } from './actions'
import { log } from './actions-2'
import { inc } from './actions-3'

export default function Page() {
  const two = { value: 2 }

  // https://github.com/vercel/next.js/issues/58463
  const data = '你好'

  return (
    <>
      <Counter
        inc={inc}
        dec={dec}
        slowInc={slowInc}
        double={async (x) => {
          'use server'
          if (data === '你好') {
            return x * two.value
          }
          // Wrong answer
          return 42
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
