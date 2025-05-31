import { Form } from './form'

export default function Page() {
  const value = 'result'

  return (
    <Form
      action={async () => {
        'use server'
        return value
      }}
    />
  )
}
