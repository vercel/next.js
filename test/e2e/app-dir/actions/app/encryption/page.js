import { Client } from './client'
import Form from './form'

async function otherAction() {
  'use server'
  return 'hi'
}

// Test top-level encryption (happens during the module load phase)
function wrapAction(value, action, element) {
  return async function () {
    'use server'
    const v = await action()
    if (v === 'hi') {
      console.log(value)
    }
    return element
  }
}

const action = wrapAction(
  'some-module-level-encryption-value',
  otherAction,
  <Client />
)

// Test runtime encryption (happens during the rendering phase)
export default function Page() {
  const secret = 'my password is qwerty123'

  return (
    <Form
      action={async () => {
        'use server'
        console.log(secret)
        return action()
      }}
    />
  )
}
