import { cookies } from 'next/headers'

export default async function Page() {
  const rscCookie1 = (await cookies()).get('rsc-cookie-value-1')?.value
  const rscCookie2 = (await cookies()).get('rsc-cookie-value-2')?.value

  return (
    <div>
      <p id="rsc-cookie-1">Cookie 1: {rscCookie1}</p>
      <p id="rsc-cookie-2">Cookie 2: {rscCookie2}</p>
      <p id="total-cookies">Total Cookie Length: {(await cookies()).size}</p>
    </div>
  )
}
