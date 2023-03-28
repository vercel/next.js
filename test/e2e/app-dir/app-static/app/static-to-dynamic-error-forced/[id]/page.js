import { cookies } from 'next/headers'

export const dynamic = 'force-static'

export default function Page({ params }) {
  if (params.id.includes('static-bailout')) {
    console.log('calling cookies', cookies())
  }

  return (
    <>
      <p>/static-to-dynamic-error-forced</p>
      <p>id: {params.id}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
