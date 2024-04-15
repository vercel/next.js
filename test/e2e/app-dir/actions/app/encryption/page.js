// Test top-level encryption (happens during the module load phase)
function wrapAction(value) {
  return async function () {
    'use server'
    console.log(value)
  }
}

const action = wrapAction('some-module-level-encryption-value')

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
      <button type="submit">Submit</button>
    </form>
  )
}
