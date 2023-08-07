import Counter from '../counter'
import Form from '../form'

import dec, { inc } from '../actions'

export default function Page() {
  const two = 2
  return (
    <>
      <Counter
        inc={inc}
        dec={dec}
        double={async (x) => {
          'use server'
          return x * two
        }}
      />
      <Form />
    </>
  )
}

export const runtime = 'edge'
