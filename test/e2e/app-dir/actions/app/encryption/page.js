async function otherAction() {
  'use server'
  return 'hi'
}
// Test top-level encryption (happens during the module load phase)
function wrapAction(value, action) {
  return async function () {
    'use server'
    const v = await action()
    if (v === 'hi') {
      console.log(value)
    }
  }
}

const action = wrapAction('some-module-level-encryption-value', otherAction)

// Test runtime encryption (happens during the rendering phase)
export default function Page() {
  const secret = 'my password is qwerty123'

  return (
    <form
      action={async () => {
        'use server'
        console.log(secret)
        await action()
        return 'success'
      }}
    >
      <button type="submit" id="submit">
        Submit
      </button>
    </form>
  )
}
