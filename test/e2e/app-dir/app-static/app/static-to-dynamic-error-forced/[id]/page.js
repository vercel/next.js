import { cookies } from 'next/headers'

export const dynamic = 'force-static'

export default async function Page(props) {
  const params = await props.params
  if (params.id.includes('static-bailout')) {
    console.log('calling cookies', await cookies())
  }

  return (
    <>
      <p>/static-to-dynamic-error-forced</p>
      <p>id: {params.id}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
