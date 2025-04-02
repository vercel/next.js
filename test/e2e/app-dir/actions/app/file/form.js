'use client'
import { accountForOverhead } from '../../account-for-overhead'

export default function Form({ action }) {
  const submit = (megaBytes) =>
    action('a'.repeat(accountForOverhead(megaBytes)))

  return (
    <>
      <button id="size-1mb" onClick={() => submit(1)}>
        1mb
      </button>
      <button id="size-3mb" onClick={() => submit(3)}>
        3mb
      </button>
    </>
  )
}
