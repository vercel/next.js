import { cookies } from 'next/headers'

export default async function Page(props) {
  const params = await props.params
  if (params.id.includes('static-bailout')) {
    console.log('calling cookies', await cookies())
  }

  return (
    <>
      <p>/static-to-dynamic-error</p>
      <p>id: {params.id}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
