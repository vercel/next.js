import { Form } from './form'

export default function Page() {
  const simpleValue = 'result'
  // JSX has debug info, which affects the serialized result
  const complexValue = <span>and more</span>
  return (
    <Form
      action={async () => {
        'use server'
        return (
          <>
            {simpleValue} {complexValue}
          </>
        )
      }}
    />
  )
}
