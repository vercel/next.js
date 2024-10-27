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
      <button id="size-2mb" onClick={() => submit(2)}>
        2mb
      </button>
    </>
  )
}
