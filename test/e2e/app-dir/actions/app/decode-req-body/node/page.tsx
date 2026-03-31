import { Form } from './form'

export default function Page() {
  return (
    <Form
      echoAction={async (value) => {
        'use server'

        return value
      }}
    />
  )
}
