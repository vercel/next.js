import { lang } from 'next/root-params'

export default function Page() {
  return (
    <form
      action={async () => {
        'use server'
        // not allowed, should error
        await lang()
      }}
    >
      <button type="submit">Submit form</button>
    </form>
  )
}
