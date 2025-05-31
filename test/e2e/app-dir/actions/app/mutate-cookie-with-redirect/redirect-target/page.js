import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <div id="redirect-target">
      <p id="value">{(await cookies()).get('testCookie')?.value ?? null}</p>
    </div>
  )
}
