import { Form } from './form'

export default function Page() {
  const foo = async () => {
    'use server'

    return 'declarator arrow function expression'
  }

  async function bar() {
    'use server'

    return 'function declaration'
  }

  return (
    <>
      <Form action={foo} />
      <Form action={bar} />
      <Form
        action={async () => {
          'use server'

          return 'arrow function expression'
        }}
      />
      <Form
        action={async function () {
          'use server'

          return 'anonymous function expression'
        }}
      />
      <Form
        action={async function baz() {
          'use server'

          return 'named function expression'
        }}
      />
    </>
  )
}
