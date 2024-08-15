import { cookies } from 'next/headers'
import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p id="total-cookies">Total Cookie Length: {cookies().size}</p>
      <Link href="/rsc-cookies-delete">To Delete Cookies Route</Link>

      <form
        action={async () => {
          'use server'
          console.log(
            '[Cookie From Action]:',
            cookies().get('rsc-secure-cookie').value
          )
        }}
      >
        <button type="submit" id="submit-server-action">
          server action
        </button>
      </form>
    </div>
  )
}
