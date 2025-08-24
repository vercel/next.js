'use client'
import { useFormStatus, useFormState } from 'react-dom'
import { addToCart } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" aria-disabled={pending} id="submit">
      Add to cart
    </button>
  )
}

export default function Page() {
  const [state, formAction] = useFormState(addToCart)
  return (
    <>
      <h1>Add to cart</h1>
      {state && <div id="result">{state}</div>}
      <form action={formAction}>
        <SubmitButton />
      </form>
    </>
  )
}
