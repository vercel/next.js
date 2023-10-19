'use client'
import { useFormStatus } from 'react-dom'
import { addToCart } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" aria-disabled={pending}>
      Add to cart
    </button>
  )
}

export default async function Page() {
  return (
    <>
      <h1>Add to cart</h1>
      <form action={addToCart}>
        <SubmitButton />
      </form>
    </>
  )
}
