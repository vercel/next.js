export default function TestPageIntercepted() {
  async function action(data) {
    'use server'

    console.log('Action Submitted (Intercepted)')
  }

  return (
    <form action={action}>
      in "modal"
      <button type="submit" id="submit-intercept-action">
        Test
      </button>
    </form>
  )
}
