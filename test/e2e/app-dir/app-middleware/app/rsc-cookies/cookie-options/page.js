import { cookies } from 'next/headers'
import Link from 'next/link'
import { Form } from '../form'

export default async function Page() {
  return (
    <div>
      <p id="total-cookies">Total Cookie Length: {(await cookies()).size}</p>
      <Link href="/rsc-cookies-delete" prefetch={false}>
        To Delete Cookies Route
      </Link>

      <Form
        action={async () => {
          'use server'
          return (await cookies()).get('rsc-secure-cookie').value
        }}
      />
    </div>
  )
}
