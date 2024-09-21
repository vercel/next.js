import { cookies } from 'next/headers'
import Link from 'next/link'
import { Form } from '../form'

export default function Page() {
  return (
    <div>
      <p id="total-cookies">Total Cookie Length: {cookies().size}</p>
      <Link href="/rsc-cookies-delete">To Delete Cookies Route</Link>

      <Form
        action={async () => {
          'use server'
          return cookies().get('rsc-secure-cookie').value
        }}
      />
    </div>
  )
}
