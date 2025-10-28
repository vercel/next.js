'use client'
import { useActionState } from 'react'
import { accountForOverhead } from '../../account-for-overhead'

export default function Form({ action }) {
  const submit = (megaBytes) =>
    action('a'.repeat(accountForOverhead(megaBytes)))
  const [, submit1] = useActionState(() => submit(1), undefined)
  const [, submit3] = useActionState(() => submit(3), undefined)
  return (
    <>
      <button id="size-1mb" onClick={submit1}>
        1mb
      </button>
      <button id="size-3mb" onClick={submit3}>
        3mb
      </button>
    </>
  )
}
