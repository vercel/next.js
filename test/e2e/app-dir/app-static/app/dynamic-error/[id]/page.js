import { cookies } from 'next/headers'

export const dynamic = 'error'

export default function Page({ params }) {
  if (params.id.includes('static-bailout')) {
    console.log('calling cookies', cookies())
  }
  return <p>Dynamic error</p>
}
