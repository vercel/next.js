import { cookies } from 'next/headers'

export const dynamic = 'error'

export default function Page({ params }) {
  // When PPR is enabled, we will bailout on parameter access.
  if (!process.env.__NEXT_EXPERIMENTAL_PPR) {
    if (params.id.includes('static-bailout')) {
      console.log('calling cookies', cookies())
    }
  }
  return <p>Dynamic error</p>
}
