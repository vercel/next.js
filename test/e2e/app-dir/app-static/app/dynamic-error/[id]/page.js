import { cookies } from 'next/headers'

export const dynamic = 'error'

export default async function Page(props) {
  const params = await props.params
  // When PPR is enabled, we will bailout on parameter access.
  if (!process.env.__NEXT_CACHE_COMPONENTS) {
    if (params.id.includes('static-bailout')) {
      console.log('calling cookies', await cookies())
    }
  }
  return <p>Dynamic error</p>
}
