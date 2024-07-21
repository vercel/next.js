import { cookies } from 'next/headers'
import Link from 'next/link'

export default function Page() {
  const rscCookie1 = cookies().get('rsc-cookie-value-1')?.value
  const rscCookie2 = cookies().get('rsc-cookie-value-2')?.value

  return (
    <div>
      <p id="rsc-cookie-1">Cookie 1: {rscCookie1}</p>
      <p id="rsc-cookie-2">Cookie 2: {rscCookie2}</p>
      <p id="total-cookies">Total Cookie Length: {cookies().size}</p>
      <Link href="/rsc-cookies-delete">To Delete Cookies Route</Link>

      <form
        action={async () => {
          'use server'
          console.log(
            '[Cookie From Action]:',
            cookies().get('rsc-cookie-value-1').value
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
