import { cookies } from 'next/headers'

export default function Page({ params }) {
  if (params.id.includes('static-bailout')) {
    console.log('calling cookies', cookies())
  }

  return (
    <>
      <p>/static-to-dynamic-error</p>
      <p>id: {params.id}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
