import { useActionState } from 'react'

async function action(prevState, formData) {
  return 'Action executed'
}

export default function Page() {
  const [state, formAction] = useActionState(action, null)

  return (
    <form action={formAction}>
      <button type="submit">Submit</button>
      {state && <p>Result: {state}</p>}
    </form>
  )
}
