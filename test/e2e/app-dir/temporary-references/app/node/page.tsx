import { Form } from './form'

export default function Page() {
  return (
    <Form
      action={async (obj) => {
        'use server'
        return obj
      }}
    />
  )
}
